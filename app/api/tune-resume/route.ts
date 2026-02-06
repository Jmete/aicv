import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { lookup } from "node:dns/promises";
import path from "node:path";
import net from "node:net";
import { z } from "zod";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { estimateWrappedLineCount } from "@/lib/line-constraints";
import { DEFAULT_PAGE_SETTINGS, PAPER_DIMENSIONS } from "@/lib/resume-defaults";
import type { FontFamily, ResumeData } from "@/types";

export const runtime = "nodejs";

const MAX_JD_CHARS = 16_000;
const MAX_OPT_ATTEMPTS = 4;
const COVER_LETTER_MAX_PAGES = 1;
const SCRAPE_TIMEOUT_MS = 10_000;
const SCRAPE_MAX_HTML_BYTES = 450_000;
const SCRAPE_MAX_TEXT_CHARS = 12_000;

const STOP_WORDS = new Set([
  "and",
  "the",
  "for",
  "with",
  "from",
  "that",
  "this",
  "have",
  "has",
  "are",
  "you",
  "your",
  "our",
  "their",
  "will",
  "into",
  "within",
  "about",
  "work",
  "role",
  "team",
  "using",
  "across",
  "plus",
  "years",
  "year",
  "experience",
  "required",
  "preferred",
  "minimum",
]);

const KNOWN_TECH_TERMS = new Set([
  "python",
  "sql",
  "postgresql",
  "mysql",
  "sqlite",
  "mongodb",
  "redis",
  "snowflake",
  "spark",
  "hadoop",
  "airflow",
  "dbt",
  "tableau",
  "powerbi",
  "excel",
  "xgboost",
  "pytorch",
  "tensorflow",
  "scikit-learn",
  "sklearn",
  "llm",
  "openai",
  "langchain",
  "javascript",
  "typescript",
  "node",
  "nodejs",
  "react",
  "nextjs",
  "next",
  "tailwind",
  "docker",
  "kubernetes",
  "aws",
  "gcp",
  "azure",
  "git",
  "linux",
  "ci/cd",
  "etl",
  "api",
  "apis",
  "erp",
  "rf",
  "nlp",
]);

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
  allowDeletions: z.boolean().optional().default(false),
  allowedAdditions: z.array(z.string()).optional().default([]),
  resumeData: resumeSchema,
});

const rewriteSchema = z.object({
  text: z.string(),
  evidenceIds: z.array(z.string()),
  keywordsCovered: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});
const aiSchema = z.object({
  optimized: z.object({
    metadata: z.object({ subtitle: z.string(), summary: rewriteSchema }),
    experience: z.array(z.object({ id: z.string(), bullets: z.array(rewriteSchema) })),
    projects: z.array(
      z.object({
        id: z.string(),
        bullets: z.array(rewriteSchema),
      })
    ),
    skills: z.array(
      z.object({
        name: z.string(),
        category: z.string(),
        evidenceIds: z.array(z.string()),
        confidence: z.number().min(0).max(1),
      })
    ),
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

type EvidenceLevel = "explicit" | "conservative_rephrase";

type RewriteMeta = {
  keywordsCovered: string[];
  confidence: number;
  evidenceLevel: EvidenceLevel;
};

type JsonPatch =
  | { op: "replace"; path: string; value: unknown }
  | { op: "add"; path: string; value: unknown }
  | { op: "remove"; path: string };

type TuneDiff = {
  op: "replace" | "insert" | "delete";
  path: string;
  patchPath: string;
  before: string | null;
  after: string | null;
  keywordsCovered: string[];
  lineDelta: number;
  confidence: number;
  evidenceLevel: EvidenceLevel;
  manualApprovalRequired: boolean;
};

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

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const extractNumericTokens = (text: string) => {
  const matches = text.match(/\b\d[\d.,]*(?:%|\+)?\b/g) ?? [];
  return [...new Set(matches.map((m) => m.trim()))];
};

const extractTools = (text: string) => {
  const tokens =
    text
      .toLowerCase()
      .match(/[a-z0-9][a-z0-9+.#/-]*/g)
      ?.filter((token) => KNOWN_TECH_TERMS.has(token)) ?? [];
  return new Set(tokens);
};

const hasAllNumericTokens = (source: string, candidate: string) => {
  const sourceTokens = extractNumericTokens(source);
  if (sourceTokens.length === 0) return true;
  return sourceTokens.every((token) => new RegExp(`\\b${escapeRegExp(token)}\\b`).test(candidate));
};

const hasNoNewTools = (candidate: string, allowedTools: Set<string>) => {
  const candidateTools = extractTools(candidate);
  for (const tool of candidateTools) {
    if (!allowedTools.has(tool)) return false;
  }
  return true;
};

const safeRewrite = (source: string, candidate: string, allowedTools: Set<string>) => {
  const cleaned = sanitize(candidate);
  if (!cleaned) return source;
  if (!hasAllNumericTokens(source, cleaned)) return source;
  if (!hasNoNewTools(cleaned, allowedTools)) return source;
  return cleaned;
};

const normalizeSkillName = (value: string) => sanitize(value).toLowerCase();

const buildResumeToolAllowlist = (resume: ResumeData, allowedAdditions: string[]) => {
  const chunks: string[] = [
    resume.metadata.summary,
    resume.metadata.subtitle,
    ...resume.experience.flatMap((entry) => entry.bullets),
    ...resume.projects.flatMap((project) => [
      project.name,
      ...project.technologies,
      ...project.bullets,
    ]),
    ...resume.skills.flatMap((skill) => [skill.name, skill.category]),
    ...allowedAdditions,
  ];
  return extractTools(chunks.join("\n"));
};

const extractKeywordHints = (jobDescription: string) => {
  const normalized = sanitize(jobDescription).toLowerCase();
  const matches = normalized.match(/[a-z][a-z0-9+#/-]{2,}/g) ?? [];
  const freq = new Map<string, number>();
  for (const token of matches) {
    if (STOP_WORDS.has(token)) continue;
    freq.set(token, (freq.get(token) ?? 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 36)
    .map(([token]) => token);
};

const matchKeywords = (text: string, keywordHints: string[]) => {
  const normalized = sanitize(text).toLowerCase();
  if (!normalized) return [];
  return keywordHints.filter((token) => normalized.includes(token)).slice(0, 6);
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
  readFile(path.join(process.cwd(), "lib", "prompts", "tune-resume.md"), "utf8");

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
  return { resumePages, coverLetterPages, resumeCharsPerLine: rb, coverCharsPerLine: cb };
};

const defaultMeta = (keywords: string[]): RewriteMeta => ({
  keywordsCovered: keywords.slice(0, 6),
  confidence: 0.72,
  evidenceLevel: "conservative_rephrase",
});

const applyDraft = (
  base: ResumeData,
  draft: AiDraft,
  valid: Set<string>,
  options: {
    allowDeletions: boolean;
    allowedTools: Set<string>;
    keywordHints: string[];
  }
) => {
  const next = structuredClone(base);
  const metaByPath = new Map<string, RewriteMeta>();
  const good = (ids: string[]) => ids.some((id) => valid.has(id));

  const subtitle = sanitize(draft.metadata.subtitle);
  if (subtitle) {
    next.metadata.subtitle = subtitle;
    metaByPath.set("metadata.subtitle", defaultMeta(matchKeywords(subtitle, options.keywordHints)));
  }

  if (good(draft.metadata.summary.evidenceIds) && sanitize(draft.metadata.summary.text)) {
    const summary = safeRewrite(base.metadata.summary, draft.metadata.summary.text, options.allowedTools);
    next.metadata.summary = summary;
    metaByPath.set("metadata.summary", {
      keywordsCovered:
        draft.metadata.summary.keywordsCovered?.slice(0, 6) ??
        matchKeywords(summary, options.keywordHints),
      confidence: draft.metadata.summary.confidence ?? 0.76,
      evidenceLevel: "explicit",
    });
  }

  const draftExperience = new Map(draft.experience.map((entry) => [entry.id, entry]));
  next.experience = base.experience.map((entry, entryIndex) => {
    const optimized = draftExperience.get(entry.id);
    if (!optimized) return entry;
    const bullets = entry.bullets.map((baseBullet, bulletIndex) => {
      const rewrite = optimized.bullets[bulletIndex];
      if (!rewrite || !good(rewrite.evidenceIds) || !sanitize(rewrite.text)) return baseBullet;
      const rewritten = safeRewrite(baseBullet, rewrite.text, options.allowedTools);
      if (rewritten !== baseBullet) {
        metaByPath.set(`experience[${entryIndex}].bullets[${bulletIndex}]`, {
          keywordsCovered:
            rewrite.keywordsCovered?.slice(0, 6) ??
            matchKeywords(rewritten, options.keywordHints),
          confidence: rewrite.confidence ?? 0.8,
          evidenceLevel: "explicit",
        });
      }
      return rewritten;
    });
    return { ...entry, bullets };
  });

  const draftProjects = new Map(draft.projects.map((project) => [project.id, project]));
  next.projects = base.projects.map((project, projectIndex) => {
    const optimized = draftProjects.get(project.id);
    if (!optimized) return project;
    const bullets = project.bullets.map((baseBullet, bulletIndex) => {
      const rewrite = optimized.bullets[bulletIndex];
      if (!rewrite || !good(rewrite.evidenceIds) || !sanitize(rewrite.text)) return baseBullet;
      const rewritten = safeRewrite(baseBullet, rewrite.text, options.allowedTools);
      if (rewritten !== baseBullet) {
        metaByPath.set(`projects[${projectIndex}].bullets[${bulletIndex}]`, {
          keywordsCovered:
            rewrite.keywordsCovered?.slice(0, 6) ??
            matchKeywords(rewritten, options.keywordHints),
          confidence: rewrite.confidence ?? 0.78,
          evidenceLevel: "explicit",
        });
      }
      return rewritten;
    });
    return { ...project, bullets };
  });

  const baseSkillByName = new Map<string, ResumeData["skills"][number]>();
  for (const skill of base.skills) {
    const key = normalizeSkillName(skill.name);
    if (!key || baseSkillByName.has(key)) continue;
    baseSkillByName.set(key, skill);
  }

  const draftSkills = draft.skills
    .filter((skill) => good(skill.evidenceIds))
    .map((skill) => ({
      name: sanitize(skill.name),
      category: sanitize(skill.category ?? ""),
      confidence: skill.confidence ?? 0.7,
    }))
    .filter((skill) => Boolean(skill.name));

  if (options.allowDeletions) {
    const seen = new Set<string>();
    const tuned = draftSkills
      .filter((skill) => {
        const key = normalizeSkillName(skill.name);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((skill) => {
        const existing = baseSkillByName.get(normalizeSkillName(skill.name));
        return {
          id: existing?.id ?? crypto.randomUUID(),
          name: skill.name,
          category: skill.category || existing?.category || "",
        };
      });
    if (tuned.length > 0) next.skills = tuned;
  } else {
    const appended = [...base.skills];
    const seen = new Set(
      base.skills.map((skill) => normalizeSkillName(skill.name)).filter(Boolean)
    );
    for (const skill of draftSkills) {
      const key = normalizeSkillName(skill.name);
      if (!key) continue;
      const existing = baseSkillByName.get(key);
      if (existing) {
        if (skill.category && skill.category !== existing.category) {
          const index = appended.findIndex((item) => item.id === existing.id);
          if (index >= 0) {
            appended[index] = { ...appended[index], category: skill.category };
            metaByPath.set(`skills[${index}]`, {
              keywordsCovered: matchKeywords(
                `${skill.name} ${skill.category}`,
                options.keywordHints
              ),
              confidence: skill.confidence,
              evidenceLevel: "explicit",
            });
          }
        }
        continue;
      }
      if (seen.has(key)) continue;
      seen.add(key);
      appended.push({
        id: crypto.randomUUID(),
        name: skill.name,
        category: skill.category || "",
      });
      metaByPath.set("skills", {
        keywordsCovered: matchKeywords(
          `${skill.name} ${skill.category}`,
          options.keywordHints
        ),
        confidence: skill.confidence,
        evidenceLevel: "explicit",
      });
    }
    next.skills = appended;
  }

  const paragraphs = draft.coverLetter.paragraphs
    .filter((paragraph) => good(paragraph.evidenceIds))
    .map((paragraph) => sanitize(paragraph.text))
    .filter(Boolean)
    .map((paragraph) => safeRewrite(base.coverLetter.body, paragraph, options.allowedTools));

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

  if (next.coverLetter.body !== base.coverLetter.body) {
    metaByPath.set("coverLetter.body", {
      keywordsCovered: matchKeywords(next.coverLetter.body, options.keywordHints),
      confidence: 0.78,
      evidenceLevel: "explicit",
    });
  }
  if (next.coverLetter.hiringManager !== base.coverLetter.hiringManager) {
    metaByPath.set("coverLetter.hiringManager", defaultMeta([]));
  }
  if (next.coverLetter.companyAddress !== base.coverLetter.companyAddress) {
    metaByPath.set("coverLetter.companyAddress", defaultMeta([]));
  }
  if (next.coverLetter.sendoff !== base.coverLetter.sendoff) {
    metaByPath.set("coverLetter.sendoff", defaultMeta([]));
  }
  if (next.coverLetter.date !== base.coverLetter.date) {
    metaByPath.set("coverLetter.date", defaultMeta([]));
  }

  return { resume: next, metaByPath };
};

const buildTuneOutputs = (
  base: ResumeData,
  next: ResumeData,
  metaByPath: Map<string, RewriteMeta>,
  keywordHints: string[],
  allowDeletions: boolean
) => {
  const metrics = estimates(base);
  const jsonPatch: JsonPatch[] = [];
  const diffs: TuneDiff[] = [];

  const makeLineDelta = (path: string, before: string, after: string) => {
    const resumeBodyCpl = Math.max(20, metrics.resumeCharsPerLine - 3);
    const coverBodyCpl = Math.max(20, metrics.coverCharsPerLine - 2);
    const cpl = path.startsWith("coverLetter") ? coverBodyCpl : resumeBodyCpl;
    return lines(after, cpl) - lines(before, cpl);
  };

  const resolveMeta = (path: string, before: string, after: string): RewriteMeta => {
    const fromMap = metaByPath.get(path);
    if (fromMap) return fromMap;
    return {
      keywordsCovered: matchKeywords(after || before, keywordHints),
      confidence: 0.72,
      evidenceLevel: "conservative_rephrase",
    };
  };

  const pushReplace = (path: string, patchPath: string, before: string, after: string) => {
    if (sanitize(before) === sanitize(after)) return;
    const meta = resolveMeta(path, before, after);
    jsonPatch.push({ op: "replace", path: patchPath, value: after });
    diffs.push({
      op: "replace",
      path,
      patchPath,
      before,
      after,
      keywordsCovered: meta.keywordsCovered,
      lineDelta: makeLineDelta(path, before, after),
      confidence: meta.confidence,
      evidenceLevel: meta.evidenceLevel,
      manualApprovalRequired: false,
    });
  };

  pushReplace("metadata.subtitle", "/metadata/subtitle", base.metadata.subtitle, next.metadata.subtitle);
  pushReplace("metadata.summary", "/metadata/summary", base.metadata.summary, next.metadata.summary);

  for (let i = 0; i < base.experience.length; i += 1) {
    const baseEntry = base.experience[i];
    const nextEntry = next.experience.find((entry) => entry.id === baseEntry.id);
    if (!nextEntry) continue;
    for (let j = 0; j < baseEntry.bullets.length; j += 1) {
      pushReplace(
        `experience[${i}].bullets[${j}]`,
        `/experience/${i}/bullets/${j}`,
        baseEntry.bullets[j] ?? "",
        nextEntry.bullets[j] ?? baseEntry.bullets[j] ?? ""
      );
    }
  }

  for (let i = 0; i < base.projects.length; i += 1) {
    const baseProject = base.projects[i];
    const nextProject = next.projects.find((project) => project.id === baseProject.id);
    if (!nextProject) continue;
    for (let j = 0; j < baseProject.bullets.length; j += 1) {
      pushReplace(
        `projects[${i}].bullets[${j}]`,
        `/projects/${i}/bullets/${j}`,
        baseProject.bullets[j] ?? "",
        nextProject.bullets[j] ?? baseProject.bullets[j] ?? ""
      );
    }
  }

  pushReplace("coverLetter.body", "/coverLetter/body", base.coverLetter.body, next.coverLetter.body);
  pushReplace(
    "coverLetter.hiringManager",
    "/coverLetter/hiringManager",
    base.coverLetter.hiringManager,
    next.coverLetter.hiringManager
  );
  pushReplace(
    "coverLetter.companyAddress",
    "/coverLetter/companyAddress",
    base.coverLetter.companyAddress,
    next.coverLetter.companyAddress
  );
  pushReplace("coverLetter.sendoff", "/coverLetter/sendoff", base.coverLetter.sendoff, next.coverLetter.sendoff);
  pushReplace("coverLetter.date", "/coverLetter/date", base.coverLetter.date, next.coverLetter.date);

  const baseSkillIndexByName = new Map<string, number>();
  for (let i = 0; i < base.skills.length; i += 1) {
    const key = normalizeSkillName(base.skills[i].name);
    if (!key || baseSkillIndexByName.has(key)) continue;
    baseSkillIndexByName.set(key, i);
  }
  const nextSkillIndexByName = new Map<string, number>();
  for (let i = 0; i < next.skills.length; i += 1) {
    const key = normalizeSkillName(next.skills[i].name);
    if (!key || nextSkillIndexByName.has(key)) continue;
    nextSkillIndexByName.set(key, i);
  }

  if (allowDeletions) {
    for (let i = base.skills.length - 1; i >= 0; i -= 1) {
      const key = normalizeSkillName(base.skills[i].name);
      if (!key || nextSkillIndexByName.has(key)) continue;
      jsonPatch.push({ op: "remove", path: `/skills/${i}` });
      diffs.push({
        op: "delete",
        path: `skills[${i}]`,
        patchPath: `/skills/${i}`,
        before: base.skills[i].name,
        after: null,
        keywordsCovered: [],
        lineDelta: -1,
        confidence: 0.65,
        evidenceLevel: "conservative_rephrase",
        manualApprovalRequired: true,
      });
    }
  }

  for (let i = 0; i < next.skills.length; i += 1) {
    const key = normalizeSkillName(next.skills[i].name);
    if (!key) continue;
    const baseIndex = baseSkillIndexByName.get(key);
    if (baseIndex == null) {
      jsonPatch.push({ op: "add", path: "/skills/-", value: next.skills[i] });
      const meta =
        metaByPath.get("skills") ?? defaultMeta(matchKeywords(next.skills[i].name, keywordHints));
      diffs.push({
        op: "insert",
        path: "skills",
        patchPath: "/skills/-",
        before: null,
        after: `${next.skills[i].name}${next.skills[i].category ? ` (${next.skills[i].category})` : ""}`,
        keywordsCovered: meta.keywordsCovered,
        lineDelta: 1,
        confidence: meta.confidence,
        evidenceLevel: meta.evidenceLevel,
        manualApprovalRequired: false,
      });
      continue;
    }
    const baseSkill = base.skills[baseIndex];
    if (sanitize(baseSkill.category) !== sanitize(next.skills[i].category)) {
      const patchPath = `/skills/${baseIndex}/category`;
      jsonPatch.push({ op: "replace", path: patchPath, value: next.skills[i].category });
      const meta =
        metaByPath.get(`skills[${baseIndex}]`) ??
        defaultMeta(matchKeywords(`${next.skills[i].name} ${next.skills[i].category}`, keywordHints));
      diffs.push({
        op: "replace",
        path: `skills[${baseIndex}].category`,
        patchPath,
        before: baseSkill.category,
        after: next.skills[i].category,
        keywordsCovered: meta.keywordsCovered,
        lineDelta: 0,
        confidence: meta.confidence,
        evidenceLevel: meta.evidenceLevel,
        manualApprovalRequired: false,
      });
    }
  }

  return { jsonPatch, diffs };
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
      scraped && manual
        ? `Primary job posting text:\n${scraped}\n\nAdditional user notes:\n${manual}`
        : scraped || manual
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
    const keywordHints = extractKeywordHints(jobDescription);
    const allowedTools = buildResumeToolAllowlist(resume, data.allowedAdditions);
    const basePrompt = `Company: ${sanitize(data.companyName)}\nJob Title: ${sanitize(
      data.jobTitle
    )}\nJob Source: ${source}\n\nJob Description:\n${jobDescription}\n\nControls:\n${JSON.stringify(
      {
        allowDeletions: data.allowDeletions,
        maxResumePages: data.maxResumePages,
        maxCoverLetterPages: COVER_LETTER_MAX_PAGES,
        inPlaceBulletRule:
          "Rewrite existing experience/project bullets in place. Keep bullet counts unchanged.",
        allowedAdditions: data.allowedAdditions,
      },
      null,
      2
    )}\n\nStyle:\n${JSON.stringify(
      {
        paperSize: resume.pageSettings.paperSize,
        resumeMargins: resume.pageSettings.resumeMargins,
        coverLetterMargins: resume.pageSettings.coverLetterMargins,
        resumeFont: resume.layoutPreferences.fontPreferences,
        coverLetterFont: resume.layoutPreferences.coverLetterFontPreferences,
        sectionVisibility: resume.sectionVisibility,
        visibleSectionsForPageFit: visibleSections,
        currentEstimatedPagesUsingVisibleSections: {
          resumePages: currentEstimation.resumePages,
          coverLetterPages: currentEstimation.coverLetterPages,
        },
      },
      null,
      2
    )}\n\nKeyword hints extracted from JD:\n${JSON.stringify(
      keywordHints.slice(0, 24),
      null,
      2
    )}\n\nClaims (allowed facts only):\n${JSON.stringify(
      claims,
      null,
      2
    )}\n\nCurrent Resume:\n${JSON.stringify(
      {
        metadata: resume.metadata,
        experience: resume.experience.map((e) => ({
          id: e.id,
          company: e.company,
          jobTitle: e.jobTitle,
          bullets: e.bullets,
        })),
        projects: resume.projects.map((p) => ({
          id: p.id,
          name: p.name,
          technologies: p.technologies,
          bullets: p.bullets,
        })),
        skills: resume.skills,
        coverLetter: resume.coverLetter,
      },
      null,
      2
    )}`;

    let best: {
      resume: ResumeData;
      est: { resumePages: number; coverLetterPages: number };
      attempt: number;
      draft: AiDraft;
      metaByPath: Map<string, RewriteMeta>;
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
        model: openai("gpt-5-nano"),
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
      const applied = applyDraft(resume, draft, claimIds, {
        allowDeletions: data.allowDeletions,
        allowedTools,
        keywordHints,
      });
      const candidate = applied.resume;
      const est = estimates(candidate);
      const withinLimit =
        est.resumePages <= data.maxResumePages &&
        est.coverLetterPages <= COVER_LETTER_MAX_PAGES;
      debugAttempts.push({
        attempt,
        invalidEvidenceIds: [],
        estimation: { resumePages: est.resumePages, coverLetterPages: est.coverLetterPages },
        withinLimit,
        draft,
      });
      if (
        !best ||
        est.resumePages + est.coverLetterPages <
          best.est.resumePages + best.est.coverLetterPages
      ) {
        best = {
          resume: candidate,
          est: { resumePages: est.resumePages, coverLetterPages: est.coverLetterPages },
          attempt,
          draft,
          metaByPath: applied.metaByPath,
        };
      }
      if (withinLimit) {
        const tuned = buildTuneOutputs(
          resume,
          candidate,
          applied.metaByPath,
          keywordHints,
          data.allowDeletions
        );
        return NextResponse.json({
          optimizedResume: candidate,
          jsonPatch: tuned.jsonPatch,
          diffs: tuned.diffs,
          constraints: {
            allowDeletions: data.allowDeletions,
            deletionsRequireManualApproval: true,
          },
          jobDescription,
          jobDescriptionSource: source,
          scrapeWarning,
          estimation: {
            resumePages: est.resumePages,
            coverLetterPages: est.coverLetterPages,
            maxResumePages: data.maxResumePages,
            maxCoverLetterPages: COVER_LETTER_MAX_PAGES,
            withinLimit: true,
          },
          raw: {
            attempts: debugAttempts,
            selectedAttempt: attempt,
            selectedEstimation: {
              resumePages: est.resumePages,
              coverLetterPages: est.coverLetterPages,
            },
            fitError: null,
          },
        });
      }
      fix =
        `Page limits exceeded. Resume pages: ${est.resumePages}/${data.maxResumePages}. ` +
        `Cover letter pages: ${est.coverLetterPages}/${COVER_LETTER_MAX_PAGES}. ` +
        "Compress wording, keep bullet counts unchanged, and avoid deleting unless allowDeletions=true.";
    }

    if (best) {
      const tuned = buildTuneOutputs(
        resume,
        best.resume,
        best.metaByPath,
        keywordHints,
        data.allowDeletions
      );
      const fitError =
        "Could not fit content within page limits. Showing best-effort tune for manual review.";
      return NextResponse.json({
        optimizedResume: best.resume,
        bestEffortResume: best.resume,
        jsonPatch: tuned.jsonPatch,
        diffs: tuned.diffs,
        constraints: {
          allowDeletions: data.allowDeletions,
          deletionsRequireManualApproval: true,
        },
        fitError,
        jobDescription,
        jobDescriptionSource: source,
        scrapeWarning,
        estimation: {
          resumePages: best.est.resumePages,
          coverLetterPages: best.est.coverLetterPages,
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
        error: "Could not generate a tuned draft.",
        jobDescription,
        jobDescriptionSource: source,
        scrapeWarning,
        raw: {
          attempts: debugAttempts,
          selectedAttempt: null,
          selectedEstimation: null,
          fitError: "Could not generate a tuned draft.",
        },
      },
      { status: 500 }
    );
  } catch (error) {
    console.error("Error tuning resume:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to tune resume." },
      { status: 500 }
    );
  }
}
