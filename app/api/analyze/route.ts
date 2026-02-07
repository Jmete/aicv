import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { lookup } from "node:dns/promises";
import path from "node:path";
import net from "node:net";
import { z } from "zod";
import { generateObject } from "ai";
import { AI_MODELS } from "@/lib/ai-models";
import { estimateWrappedLineCount } from "@/lib/line-constraints";
import { createId } from "@/lib/id";
import { DEFAULT_PAGE_SETTINGS, PAPER_DIMENSIONS } from "@/lib/resume-defaults";
import type { FontFamily, ResumeData } from "@/types";

export const runtime = "nodejs";

const MAX_JD_CHARS = 16_000;
const MAX_OPT_ATTEMPTS = 3;
const COVER_LETTER_MAX_PAGES = 1;
const SCRAPE_TIMEOUT_MS = 10_000;
const SCRAPE_MAX_HTML_BYTES = 450_000;
const SCRAPE_MAX_TEXT_CHARS = 12_000;

const resumeSchema = z.object({
  pageSettings: z.object({
    paperSize: z.enum(["a4", "letter"]),
    resumeMargins: z.object({
      top: z.number(),
      right: z.number(),
      bottom: z.number(),
      left: z.number(),
    }),
    coverLetterMargins: z.object({
      top: z.number(),
      right: z.number(),
      bottom: z.number(),
      left: z.number(),
    }),
    margins: z
      .object({
        top: z.number(),
        right: z.number(),
        bottom: z.number(),
        left: z.number(),
      })
      .optional(),
  }),
  metadata: z.object({
    fullName: z.string(),
    subtitle: z.string(),
    summary: z.string(),
    contactInfo: z.object({
      email: z.string(),
      phone: z.string(),
      location: z.string(),
      linkedin: z.string().optional(),
      website: z.string().optional(),
      github: z.string().optional(),
    }),
  }),
  sectionVisibility: z.object({
    summary: z.boolean(),
    experience: z.boolean(),
    projects: z.boolean(),
    education: z.boolean(),
    skills: z.boolean(),
  }),
  layoutPreferences: z.object({
    fontPreferences: z.object({
      family: z.enum(["serif", "sans", "mono"]),
      sizes: z.object({
        name: z.number(),
        subtitle: z.number(),
        contact: z.number(),
        sectionTitle: z.number(),
        itemTitle: z.number(),
        itemDetail: z.number(),
        itemMeta: z.number(),
        body: z.number(),
      }),
    }),
    coverLetterFontPreferences: z.object({
      family: z.enum(["serif", "sans", "mono"]),
      sizes: z.object({
        name: z.number(),
        subtitle: z.number(),
        contact: z.number(),
        sectionTitle: z.number(),
        itemTitle: z.number(),
        itemDetail: z.number(),
        itemMeta: z.number(),
        body: z.number(),
      }),
    }),
  }),
  coverLetter: z.object({
    date: z.string(),
    hiringManager: z.string(),
    companyAddress: z.string(),
    body: z.string(),
    sendoff: z.string(),
  }),
  experience: z.array(
    z.object({
      id: z.string(),
      company: z.string(),
      jobTitle: z.string(),
      location: z.string(),
      startDate: z.string(),
      endDate: z.string(),
      bullets: z.array(z.string()),
    })
  ),
  projects: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      technologies: z.array(z.string()),
      bullets: z.array(z.string()),
    })
  ),
  education: z.array(
    z.object({
      id: z.string(),
      degree: z.string(),
      institution: z.string().optional(),
      location: z.string().optional(),
      field: z.string().optional(),
      graduationDate: z.string().optional(),
      gpa: z.string().optional(),
    })
  ),
  skills: z.array(z.object({ id: z.string(), name: z.string(), category: z.string() })),
});

const requestSchema = z.object({
  companyName: z.string().optional().default(""),
  jobTitle: z.string().optional().default(""),
  jobUrl: z.string().optional().default(""),
  jobDescription: z.string().optional().default(""),
  maxResumePages: z.number().int().min(1).max(4).default(1),
  resumeData: resumeSchema,
});

const rewriteSchema = z.object({ text: z.string(), evidenceIds: z.array(z.string()) });
const aiSchema = z.object({
  optimized: z.object({
    metadata: z.object({ subtitle: z.string(), summary: rewriteSchema }),
    experience: z.array(z.object({ id: z.string(), bullets: z.array(rewriteSchema) })),
    projects: z.array(
      z.object({
        id: z.string(),
        technologies: z.array(z.string()),
        bullets: z.array(rewriteSchema),
      })
    ),
    educationOrder: z.array(z.string()),
    skills: z.array(z.object({ name: z.string(), category: z.string(), evidenceIds: z.array(z.string()) })),
    coverLetter: z.object({
      date: z.string(),
      hiringManager: z.string(),
      companyAddress: z.string(),
      paragraphs: z.array(rewriteSchema),
      sendoff: z.string(),
    }),
  }),
});

type AiDraft = z.infer<typeof aiSchema>["optimized"];

const sanitize = (v: string) => v.replace(/\u0000/g, "").replace(/\r\n/g, "\n").trim();
const toPt = (mm: number) => (mm * 72) / 25.4;
const pad2 = (v: number) => String(v).padStart(2, "0");
const toYmd = (date: Date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());
const parseDateInput = (value: string) => {
  const raw = sanitize(value);
  if (!raw) return null;
  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) {
    const year = Number.parseInt(ymd[1], 10);
    const month = Number.parseInt(ymd[2], 10) - 1;
    const day = Number.parseInt(ymd[3], 10);
    const parsed = new Date(year, month, day);
    if (
      parsed.getFullYear() === year &&
      parsed.getMonth() === month &&
      parsed.getDate() === day
    ) {
      return parsed;
    }
    return null;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};
const normalizeCoverLetterDate = (raw: string, fallback = "") => {
  const today = startOfDay(new Date());
  const parsed = parseDateInput(raw) ?? parseDateInput(fallback) ?? today;
  const date = startOfDay(parsed);
  return toYmd(date > today ? today : date);
};

const charFactor = (family: FontFamily) => (family === "mono" ? 0.61 : family === "sans" ? 0.54 : 0.52);
const charsPerLine = (w: number, fontSize: number, family: FontFamily) =>
  Math.max(20, Math.floor(w / Math.max(2.4, fontSize * charFactor(family))));
const lines = (text: string, cpl: number) => estimateWrappedLineCount(sanitize(text), cpl);
const lh = (fontSize: number, relaxed = false) => fontSize * (relaxed ? 1.45 : 1.28);

const isPrivateIpv4 = (ip: string) => {
  const p = ip.split(".").map((s) => Number.parseInt(s, 10));
  if (p.length !== 4 || p.some(Number.isNaN)) return true;
  const [a, b] = p;
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
};

const isPrivateIp = (ip: string) => {
  if (net.isIP(ip) === 4) return isPrivateIpv4(ip);
  const n = ip.toLowerCase();
  if (n === "::1" || n === "::" || n.startsWith("fc") || n.startsWith("fd")) return true;
  return n.startsWith("fe8") || n.startsWith("fe9") || n.startsWith("fea") || n.startsWith("feb");
};

const safeUrl = async (raw: string) => {
  const u = new URL(raw);
  if (!["http:", "https:"].includes(u.protocol)) throw new Error("Only http/https URLs are allowed.");
  if (u.username || u.password) throw new Error("Credentialed URLs are not allowed.");
  const host = u.hostname.toLowerCase();
  if (["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(host)) throw new Error("Local URLs are blocked.");
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".lan")) throw new Error("Private hostnames are blocked.");
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error("Private IP addresses are blocked.");
  } else {
    const addrs = await lookup(host, { all: true, verbatim: true });
    if (addrs.some((a) => isPrivateIp(a.address))) throw new Error("Resolved host points to a private address.");
  }
  return u.toString();
};

const htmlToText = (html: string) =>
  sanitize(
    html
      .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, " ")
      .replace(/<(script|style|noscript|template|svg|canvas|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr|\/section|\/article|\/main|\/ul|\/ol|\/table)>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "\n- ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;|&#160;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/\u00a0/g, " ")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
  );

class ScrapeError extends Error {
  constructor(
    message: string,
    readonly code: "challenge" | "request" | "content" | "timeout"
  ) {
    super(message);
    this.name = "ScrapeError";
  }
}

const readBodySnippet = async (response: Response, maxBytes: number) => {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  try {
    while (total < maxBytes) {
      const chunk = await reader.read();
      if (chunk.done || !chunk.value) break;
      const remaining = maxBytes - total;
      const part = chunk.value.byteLength > remaining ? chunk.value.subarray(0, remaining) : chunk.value;
      total += part.byteLength;
      text += decoder.decode(part, { stream: true });
      if (part.byteLength < chunk.value.byteLength) break;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return text + decoder.decode();
};

const detectChallenge = (status: number, headers: Headers, html: string) => {
  const challengeStatus = new Set([401, 403, 429, 503, 999]);
  if (challengeStatus.has(status)) return true;
  const body = html.toLowerCase();
  const markers = [
    "captcha",
    "verify you are human",
    "access denied",
    "attention required",
    "just a moment",
    "ray id",
    "cf-chl",
    "datadome",
    "incapsula",
    "perimeterx",
    "bot detection",
  ];
  const challengeHeader = headers.get("cf-mitigated")?.toLowerCase() === "challenge";
  return challengeHeader || markers.some((m) => body.includes(m));
};

const scrapeText = async (url: string) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    const contentType = r.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType && !(contentType.includes("text/html") || contentType.includes("text/plain"))) {
      throw new ScrapeError("URL did not return an HTML or text page.", "content");
    }
    const html = await readBodySnippet(r, SCRAPE_MAX_HTML_BYTES);
    if (detectChallenge(r.status, r.headers, html)) {
      throw new ScrapeError(
        "The site appears to block automated access (captcha/challenge). Paste the job description manually.",
        "challenge"
      );
    }
    if (!r.ok) {
      throw new ScrapeError(`Request failed (${r.status}).`, "request");
    }
    const cleaned = contentType.includes("text/plain") ? sanitize(html) : htmlToText(html);
    const compact = cleaned
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n")
      .replace(/\n{3,}/g, "\n\n");
    return compact.slice(0, SCRAPE_MAX_TEXT_CHARS);
  } catch (error) {
    if (error instanceof ScrapeError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ScrapeError("Timed out while fetching the job URL.", "timeout");
    }
    throw new ScrapeError(
      error instanceof Error ? error.message : "Unknown error while scraping job URL.",
      "request"
    );
  } finally {
    clearTimeout(timeout);
  }
};

const getPrompt = async () =>
  readFile(path.join(process.cwd(), "lib", "prompts", "application-optimize.md"), "utf8");

const estimates = (resume: ResumeData) => {
  const paper = PAPER_DIMENSIONS[resume.pageSettings.paperSize];
  const rm = resume.pageSettings.resumeMargins ?? resume.pageSettings.margins ?? DEFAULT_PAGE_SETTINGS.resumeMargins;
  const cm = resume.pageSettings.coverLetterMargins ?? resume.pageSettings.margins ?? DEFAULT_PAGE_SETTINGS.coverLetterMargins;
  const rw = toPt(Math.max(30, paper.width - rm.left - rm.right));
  const rh = toPt(Math.max(30, paper.height - rm.top - rm.bottom));
  const cw = toPt(Math.max(30, paper.width - cm.left - cm.right));
  const ch = toPt(Math.max(30, paper.height - cm.top - cm.bottom));
  const rf = resume.layoutPreferences.fontPreferences;
  const cf = resume.layoutPreferences.coverLetterFontPreferences;
  const sv = resume.sectionVisibility;
  const rb = charsPerLine(rw, rf.sizes.body, rf.family);
  const cb = charsPerLine(cw, cf.sizes.body, cf.family);
  let rhUsed = lh(rf.sizes.name) + lh(rf.sizes.subtitle) + lh(rf.sizes.contact) + 20;

  if (sv.summary && sanitize(resume.metadata.summary)) {
    rhUsed += lh(rf.sizes.sectionTitle) + 6;
    rhUsed += lines(resume.metadata.summary, rb) * lh(rf.sizes.body, true);
  }

  if (sv.experience && resume.experience.length > 0) {
    rhUsed += lh(rf.sizes.sectionTitle) + 6;
    for (const e of resume.experience) {
      rhUsed += lh(rf.sizes.itemTitle) + lh(rf.sizes.itemMeta) + 6;
      for (const b of e.bullets) rhUsed += lines(b, rb - 3) * lh(rf.sizes.body, true) + 2;
    }
  }

  if (sv.projects && resume.projects.length > 0) {
    rhUsed += lh(rf.sizes.sectionTitle) + 6;
    for (const p of resume.projects) {
      rhUsed += lh(rf.sizes.itemTitle);
      for (const b of p.bullets) rhUsed += lines(b, rb - 3) * lh(rf.sizes.body, true) + 2;
    }
  }

  if (sv.education && resume.education.length > 0) {
    rhUsed += lh(rf.sizes.sectionTitle) + 6;
    for (const e of resume.education) {
      const detail = sanitize(
        `${e.degree} ${e.institution ?? ""} ${e.field ?? ""} ${e.location ?? ""} ${e.graduationDate ?? ""} ${e.gpa ?? ""}`
      );
      rhUsed += lh(rf.sizes.itemTitle) + lh(rf.sizes.itemMeta) + 2;
      if (detail) rhUsed += lines(detail, rb) * lh(rf.sizes.itemDetail, true) + 2;
    }
  }

  if (sv.skills && resume.skills.length > 0) {
    rhUsed += lh(rf.sizes.sectionTitle) + 6;
    rhUsed += Math.max(1, resume.skills.length / 8) * lh(rf.sizes.body);
  }

  const resumePages = Math.max(1, Math.ceil(rhUsed / rh));

  const paragraphs = sanitize(resume.coverLetter.body).split(/\n{2,}/).filter(Boolean);
  let chUsed = lh(cf.sizes.body, true) * 8;
  for (const p of paragraphs) chUsed += lines(p, cb) * lh(cf.sizes.body, true) + 8;
  const coverLetterPages = Math.max(1, Math.ceil(chUsed / ch));
  return { resumePages, coverLetterPages };
};

const applyDraft = (base: ResumeData, draft: AiDraft, valid: Set<string>) => {
  const next = structuredClone(base);
  const good = (ids: string[]) => ids.some((id) => valid.has(id));
  if (sanitize(draft.metadata.subtitle)) next.metadata.subtitle = sanitize(draft.metadata.subtitle);
  if (good(draft.metadata.summary.evidenceIds) && sanitize(draft.metadata.summary.text)) {
    next.metadata.summary = sanitize(draft.metadata.summary.text);
  }

  const expMap = new Map(next.experience.map((e) => [e.id, e]));
  const expEdits = new Map<string, string[]>();
  for (const e of draft.experience) {
    const cur = expMap.get(e.id);
    if (!cur) continue;
    const bullets = e.bullets.filter((b) => good(b.evidenceIds)).map((b) => sanitize(b.text)).filter(Boolean);
    if (bullets.length > 0) {
      expEdits.set(e.id, bullets);
    }
  }
  if (expEdits.size > 0) {
    next.experience = next.experience.map((entry) => {
      const bullets = expEdits.get(entry.id);
      return bullets ? { ...entry, bullets } : entry;
    });
  }

  const projMap = new Map(next.projects.map((p) => [p.id, p]));
  const projEdits = new Map<string, { bullets?: string[]; technologies?: string[] }>();
  for (const p of draft.projects) {
    const cur = projMap.get(p.id);
    if (!cur) continue;
    const bullets = p.bullets.filter((b) => good(b.evidenceIds)).map((b) => sanitize(b.text)).filter(Boolean);
    const technologies = p.technologies
      .map(sanitize)
      .filter(Boolean)
      .slice(0, 14);

    const edit: { bullets?: string[]; technologies?: string[] } = {};
    if (bullets.length > 0) edit.bullets = bullets;
    if (technologies.length > 0) edit.technologies = technologies;
    if (Object.keys(edit).length > 0) {
      projEdits.set(p.id, edit);
    }
  }
  if (projEdits.size > 0) {
    next.projects = next.projects.map((project) => {
      const edit = projEdits.get(project.id);
      if (!edit) return project;
      return {
        ...project,
        bullets: edit.bullets ?? project.bullets,
        technologies: edit.technologies ?? project.technologies,
      };
    });
  }

  const eduMap = new Map(next.education.map((e) => [e.id, e]));
  const eduOrdered = draft.educationOrder.map((id) => eduMap.get(id)).filter((e): e is NonNullable<typeof e> => Boolean(e));
  if (eduOrdered.length) next.education = [...eduOrdered, ...next.education.filter((e) => !eduOrdered.includes(e))];

  const seenSkillNames = new Set<string>();
  const skillRows = draft.skills
    .filter((s) => good(s.evidenceIds))
    .map((s) => sanitize(s.name))
    .filter(Boolean)
    .filter((name) => {
      const key = name.toLowerCase();
      if (seenSkillNames.has(key)) return false;
      seenSkillNames.add(key);
      return true;
    })
    .map((name) => ({ id: createId(), name, category: "" }));
  if (skillRows.length) next.skills = skillRows;
  const paragraphs = draft.coverLetter.paragraphs.filter((p) => good(p.evidenceIds)).map((p) => sanitize(p.text)).filter(Boolean);
  const normalizedCoverLetterDate = normalizeCoverLetterDate(
    draft.coverLetter.date,
    next.coverLetter.date
  );
  next.coverLetter = {
    date: normalizedCoverLetterDate,
    hiringManager: sanitize(draft.coverLetter.hiringManager) || next.coverLetter.hiringManager,
    companyAddress: sanitize(draft.coverLetter.companyAddress) || next.coverLetter.companyAddress,
    body: paragraphs.length ? paragraphs.join("\n\n") : next.coverLetter.body,
    sendoff: sanitize(draft.coverLetter.sendoff) || next.coverLetter.sendoff,
  };
  return next;
};

export async function POST(request: Request) {
  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
    }
    const data = parsed.data;
    const manual = sanitize(data.jobDescription);
    const rawUrl = sanitize(data.jobUrl);
    let scraped = "";
    let scrapeWarning: string | null = null;
    if (rawUrl) {
      try {
        scraped = await scrapeText(await safeUrl(rawUrl));
      } catch (e) {
        const message = e instanceof Error ? e.message : "Unknown error.";
        if (!manual) {
          return NextResponse.json(
            {
              error: `Job URL scraping failed: ${message}`,
            },
            { status: 422 }
          );
        }
        scrapeWarning = `Job URL scraping failed, so only pasted text was used: ${message}`;
      }
    }
    const source = scraped && manual ? "url+manual" : scraped ? "url" : "manual";
    const jobDescription = sanitize(
      scraped && manual ? `Primary job posting text:\n${scraped}\n\nAdditional user notes:\n${manual}` : scraped || manual
    ).slice(0, MAX_JD_CHARS);
    if (!jobDescription) {
      return NextResponse.json({ error: "Provide a job URL or pasted job description." }, { status: 400 });
    }

    const resume = data.resumeData as ResumeData;
    const claims = [
      ...resume.experience.flatMap((e, i) => e.bullets.map((b, j) => ({ id: `exp-${i + 1}-${j + 1}`, text: sanitize(b) }))),
      ...resume.projects.flatMap((p, i) => p.bullets.map((b, j) => ({ id: `proj-${i + 1}-${j + 1}`, text: sanitize(b) }))),
      { id: "summary", text: sanitize(resume.metadata.summary) },
      ...resume.skills.map((s, i) => ({ id: `skill-${i + 1}`, text: `${sanitize(s.name)} ${sanitize(s.category)}` })),
      ...resume.education.map((e, i) => ({ id: `edu-${i + 1}`, text: `${sanitize(e.degree)} ${sanitize(e.field ?? "")} ${sanitize(e.institution ?? "")}` })),
    ].filter((c) => c.text);
    const claimIds = new Set(claims.map((c) => c.id));
    if (claims.length === 0) {
      return NextResponse.json({ error: "Resume has no source claims to optimize." }, { status: 400 });
    }

    const system = await getPrompt();
    const currentEstimation = estimates(resume);
    const visibleSections = Object.entries(resume.sectionVisibility)
      .filter(([, isVisible]) => isVisible)
      .map(([section]) => section);
    const hiddenSections = Object.entries(resume.sectionVisibility)
      .filter(([, isVisible]) => !isVisible)
      .map(([section]) => section);
    const basePrompt = `Company: ${sanitize(data.companyName)}\nJob Title: ${sanitize(data.jobTitle)}\nJob Source: ${source}\n\nJob Description:\n${jobDescription}\n\nStyle:\n${JSON.stringify({
      paperSize: resume.pageSettings.paperSize,
      resumeMargins: resume.pageSettings.resumeMargins,
      coverLetterMargins: resume.pageSettings.coverLetterMargins,
      resumeFont: resume.layoutPreferences.fontPreferences,
      coverLetterFont: resume.layoutPreferences.coverLetterFontPreferences,
      sectionVisibility: resume.sectionVisibility,
      visibleSectionsForPageFit: visibleSections,
      hiddenSectionsForPageFit: hiddenSections,
      pageFitRule: "Only visible resume sections count toward resume page limits. Hidden sections must not be considered when pruning content.",
      currentEstimatedPagesUsingVisibleSections: currentEstimation,
      maxResumePages: data.maxResumePages,
      maxCoverLetterPages: COVER_LETTER_MAX_PAGES,
    }, null, 2)}\n\nClaims (allowed facts only):\n${JSON.stringify(claims, null, 2)}\n\nCurrent Resume:\n${JSON.stringify({
      metadata: resume.metadata,
      experience: resume.experience.map((e) => ({ id: e.id, company: e.company, jobTitle: e.jobTitle, bullets: e.bullets })),
      projects: resume.projects.map((p) => ({ id: p.id, name: p.name, technologies: p.technologies, bullets: p.bullets })),
      education: resume.education.map((e) => ({ id: e.id, degree: e.degree, field: e.field, institution: e.institution })),
      skills: resume.skills,
      coverLetter: resume.coverLetter,
    }, null, 2)}`;

    let best: {
      resume: ResumeData;
      est: { resumePages: number; coverLetterPages: number };
      attempt: number;
      draft: AiDraft;
    } | null = null;
    const debugAttempts: Array<{
      attempt: number;
      invalidEvidenceIds: string[];
      estimation?: { resumePages: number; coverLetterPages: number };
      withinLimit?: boolean;
      draft: AiDraft;
    }> = [];
    let fix = "";
    let prev: AiDraft | null = null;
    for (let attempt = 1; attempt <= MAX_OPT_ATTEMPTS; attempt += 1) {
      const draftResult = (await generateObject({
        model: AI_MODELS.resumeAnalyze,
        system,
        prompt: [basePrompt, prev ? `Previous draft:\n${JSON.stringify(prev, null, 2)}` : "", fix].filter(Boolean).join("\n\n"),
        schema: aiSchema,
      })) as { object: { optimized: AiDraft } };
      const draft = draftResult.object.optimized;
      prev = draft;
      const invalid = [
        ...new Set(
          [
            ...draft.metadata.summary.evidenceIds,
            ...draft.experience.flatMap((e) => e.bullets.flatMap((b) => b.evidenceIds)),
            ...draft.projects.flatMap((p) => p.bullets.flatMap((b) => b.evidenceIds)),
            ...draft.skills.flatMap((s) => s.evidenceIds),
            ...draft.coverLetter.paragraphs.flatMap((p) => p.evidenceIds),
          ].filter((id) => !claimIds.has(id))
        ),
      ];
      if (invalid.length > 0) {
        debugAttempts.push({
          attempt,
          invalidEvidenceIds: invalid,
          draft,
        });
        fix = `Unsupported evidence IDs were used: ${invalid.join(", ")}. Use only provided claim IDs.`;
        continue;
      }
      const candidate = applyDraft(resume, draft, claimIds);
      const est = estimates(candidate);
      const withinLimit =
        est.resumePages <= data.maxResumePages &&
        est.coverLetterPages <= COVER_LETTER_MAX_PAGES;
      debugAttempts.push({
        attempt,
        invalidEvidenceIds: [],
        estimation: est,
        withinLimit,
        draft,
      });
      if (
        !best ||
        est.resumePages + est.coverLetterPages <
          best.est.resumePages + best.est.coverLetterPages
      ) {
        best = { resume: candidate, est, attempt, draft };
      }
      if (withinLimit) {
        return NextResponse.json({
          optimizedResume: candidate,
          jobDescription,
          jobDescriptionSource: source,
          scrapeWarning,
          estimation: {
            ...est,
            maxResumePages: data.maxResumePages,
            maxCoverLetterPages: COVER_LETTER_MAX_PAGES,
            withinLimit: true,
          },
          raw: {
            attempts: debugAttempts,
            selectedAttempt: attempt,
            selectedEstimation: est,
            fitError: null,
          },
        });
      }
      fix =
        `Page limits exceeded. Resume pages: ${est.resumePages}/${data.maxResumePages}. ` +
        `Cover letter pages: ${est.coverLetterPages}/${COVER_LETTER_MAX_PAGES}. ` +
        "Rewrite for concision, rank claims by job relevance, and prune least-relevant bullets until it fits while preserving factual accuracy.";
    }

    if (best) {
      const fitError =
        "Could not fit content within page limits. Showing best effort draft; you can still apply it and review in print preview.";
      return NextResponse.json({
        optimizedResume: best.resume,
        bestEffortResume: best.resume,
        fitError,
        jobDescription,
        jobDescriptionSource: source,
        scrapeWarning,
        estimation: {
          ...best.est,
          maxResumePages: data.maxResumePages,
          maxCoverLetterPages: COVER_LETTER_MAX_PAGES,
          withinLimit: false,
        },
        raw: {
          attempts: debugAttempts,
          selectedAttempt: best.attempt,
          selectedEstimation: best.est,
          fitError,
          selectedDraft: best.draft,
        },
      });
    }

    return NextResponse.json(
      {
        error: "Could not generate an optimized draft.",
        jobDescription,
        jobDescriptionSource: source,
        scrapeWarning,
        raw: {
          attempts: debugAttempts,
          selectedAttempt: null,
          selectedEstimation: null,
          fitError: "Could not generate an optimized draft.",
        },
      },
      { status: 500 }
    );
  } catch (error) {
    console.error("Error analyzing job description:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to analyze job description." },
      { status: 500 }
    );
  }
}
