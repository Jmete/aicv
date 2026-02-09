import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { z } from "zod";
import { generateObject } from "ai";
import { AI_MODELS } from "@/lib/ai-models";
import { DEFAULT_RESUME_DATA } from "@/lib/resume-defaults";
import { createId } from "@/lib/id";
import type { ContactFieldKey, ResumeData, ResumeImportContent } from "@/types";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const CONTACT_FIELD_KEYS = [
  "email",
  "phone",
  "location",
  "linkedin",
  "website",
  "github",
] as const;
const SECTION_KEYS = ["summary", "experience", "projects", "education", "skills"] as const;
const MARGIN_PRESETS = ["narrow", "normal", "moderate"] as const;
const FONT_FAMILIES = ["serif", "sans", "mono"] as const;
const EXPERIENCE_ORDER = ["title-first", "company-first"] as const;
const EDUCATION_ORDER = ["degree-first", "institution-first"] as const;
const TEXT_ALIGNMENTS = ["left", "center", "right"] as const;
const PAPER_SIZES = ["a4", "letter"] as const;

const resumeImportContentSchema = z.object({
  metadata: z.object({
    fullName: z.string(),
    subtitle: z.string(),
    contactInfo: z.object({
      email: z.string(),
      phone: z.string(),
      location: z.string(),
      linkedin: z.string(),
      website: z.string(),
      github: z.string(),
    }),
    summary: z.string(),
  }),
  experience: z.array(
    z.object({
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
      name: z.string(),
      technologies: z.array(z.string()),
      bullets: z.array(z.string()),
    })
  ),
  education: z.array(
    z.object({
      degree: z.string(),
      institution: z.string(),
      location: z.string(),
      field: z.string(),
      graduationDate: z.string(),
      gpa: z.string(),
      other: z.string().optional().default(""),
    })
  ),
  skills: z.array(
    z.object({
      name: z.string(),
      category: z.string(),
    })
  ),
});

const resumeImportSchema = z.object({
  resume: resumeImportContentSchema,
  fieldFeedback: z.array(
    z.object({
      path: z.string(),
      quality: z.enum(["good", "needs improvement"]),
      improvementSuggestions: z.array(
        z.object({
          id: z.string(),
          issue: z.string(),
          requiresUserInput: z.boolean(),
          requiredInputs: z.array(
            z.object({
              key: z.string(),
              label: z.string(),
              placeholder: z.string(),
            })
          ),
          recommendedReplacement: z.string().nullable(),
        })
      ),
    })
  ),
});

const sanitizeText = (value: string) =>
  value.replace(/\u0000/g, "").replace(/\r\n/g, "\n").trim();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown) =>
  typeof value === "string" ? value.replace(/\u0000/g, "") : "";

const asStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value
        .map((item) => asString(item))
        .filter((item) => item.trim().length > 0)
    : [];

const asNumber = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const asInteger = (value: unknown, fallback: number) =>
  Number.isInteger(value) ? (value as number) : fallback;

const asBoolean = (value: unknown, fallback: boolean) =>
  typeof value === "boolean" ? value : fallback;

const asEnum = <T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T
) => {
  if (typeof value !== "string") return fallback;
  return allowed.includes(value as T) ? (value as T) : fallback;
};

const normalizeOrderedValues = <T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: readonly T[]
) => {
  if (!Array.isArray(value)) return [...fallback];
  const seen = new Set<T>();
  const result: T[] = [];

  for (const item of value) {
    if (typeof item !== "string") continue;
    if (!allowed.includes(item as T)) continue;
    const normalized = item as T;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  for (const item of fallback) {
    if (seen.has(item)) continue;
    seen.add(item);
    result.push(item);
  }

  return result;
};

const normalizeMargins = (
  value: unknown,
  fallback: ResumeData["pageSettings"]["resumeMargins"]
) => {
  const source = isRecord(value) ? value : {};
  return {
    top: asNumber(source.top, fallback.top),
    right: asNumber(source.right, fallback.right),
    bottom: asNumber(source.bottom, fallback.bottom),
    left: asNumber(source.left, fallback.left),
  };
};

const normalizeFontSizes = (
  value: unknown,
  fallback: ResumeData["layoutPreferences"]["fontPreferences"]["sizes"]
) => {
  const source = isRecord(value) ? value : {};
  return {
    name: asNumber(source.name, fallback.name),
    subtitle: asNumber(source.subtitle, fallback.subtitle),
    contact: asNumber(source.contact, fallback.contact),
    sectionTitle: asNumber(source.sectionTitle, fallback.sectionTitle),
    itemTitle: asNumber(source.itemTitle, fallback.itemTitle),
    itemDetail: asNumber(source.itemDetail, fallback.itemDetail),
    itemMeta: asNumber(source.itemMeta, fallback.itemMeta),
    body: asNumber(source.body, fallback.body),
  };
};

const normalizeHyperlinks = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [...(DEFAULT_RESUME_DATA.hyperlinks ?? [])];
  }
  const normalized = value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const text = asString(entry.text);
    const start = asInteger(entry.start, -1);
    const end = asInteger(entry.end, -1);
    if (
      text.length === 0 ||
      start < 0 ||
      end <= start ||
      end - start !== text.length
    ) {
      return [];
    }
    return [
      {
        id: asString(entry.id) || createId(),
        path: asString(entry.path),
        start,
        end,
        text,
        url: asString(entry.url),
      },
    ];
  });
  return normalized;
};

const normalizeResumeData = (input: unknown): ResumeData | null => {
  if (!isRecord(input)) return null;

  const requiredKeys = [
    "pageSettings",
    "metadata",
    "sectionVisibility",
    "layoutPreferences",
    "coverLetter",
    "experience",
    "projects",
    "education",
    "skills",
  ];
  if (!requiredKeys.every((key) => key in input)) {
    return null;
  }

  const base = DEFAULT_RESUME_DATA;
  const pageSettingsInput = isRecord(input.pageSettings) ? input.pageSettings : {};
  const metadataInput = isRecord(input.metadata) ? input.metadata : {};
  const sectionVisibilityInput = isRecord(input.sectionVisibility)
    ? input.sectionVisibility
    : {};
  const layoutInput = isRecord(input.layoutPreferences) ? input.layoutPreferences : {};
  const coverLetterInput = isRecord(input.coverLetter) ? input.coverLetter : {};
  const contactInput = isRecord(metadataInput.contactInfo)
    ? metadataInput.contactInfo
    : {};
  const headerAlignmentInput = isRecord(layoutInput.headerAlignment)
    ? layoutInput.headerAlignment
    : {};
  const fontPreferencesInput = isRecord(layoutInput.fontPreferences)
    ? layoutInput.fontPreferences
    : {};
  const coverLetterFontPreferencesInput = isRecord(
    layoutInput.coverLetterFontPreferences
  )
    ? layoutInput.coverLetterFontPreferences
    : {};

  const resumeMargins = normalizeMargins(
    pageSettingsInput.resumeMargins,
    base.pageSettings.resumeMargins
  );
  const coverLetterMargins = normalizeMargins(
    pageSettingsInput.coverLetterMargins,
    base.pageSettings.coverLetterMargins
  );

  const fallbackContactOrder = base.layoutPreferences.contactOrder;
  const fallbackSectionOrder = base.layoutPreferences.sectionOrder;

  return {
    pageSettings: {
      paperSize: asEnum(
        pageSettingsInput.paperSize,
        PAPER_SIZES,
        base.pageSettings.paperSize
      ),
      resumeMargins,
      resumeMarginPreset: asEnum(
        pageSettingsInput.resumeMarginPreset,
        MARGIN_PRESETS,
        base.pageSettings.resumeMarginPreset
      ),
      coverLetterMargins,
      coverLetterMarginPreset: asEnum(
        pageSettingsInput.coverLetterMarginPreset,
        MARGIN_PRESETS,
        base.pageSettings.coverLetterMarginPreset
      ),
      margins: normalizeMargins(pageSettingsInput.margins, resumeMargins),
      marginPreset: asEnum(
        pageSettingsInput.marginPreset,
        MARGIN_PRESETS,
        base.pageSettings.marginPreset ?? base.pageSettings.resumeMarginPreset
      ),
    },
    metadata: {
      fullName: asString(metadataInput.fullName),
      subtitle: asString(metadataInput.subtitle),
      summary: asString(metadataInput.summary),
      contactInfo: {
        email: asString(contactInput.email),
        phone: asString(contactInput.phone),
        location: asString(contactInput.location),
        linkedin: asString(contactInput.linkedin),
        website: asString(contactInput.website),
        github: asString(contactInput.github),
      },
    },
    sectionVisibility: {
      summary: asBoolean(
        sectionVisibilityInput.summary,
        base.sectionVisibility.summary
      ),
      experience: asBoolean(
        sectionVisibilityInput.experience,
        base.sectionVisibility.experience
      ),
      projects: asBoolean(
        sectionVisibilityInput.projects,
        base.sectionVisibility.projects
      ),
      education: asBoolean(
        sectionVisibilityInput.education,
        base.sectionVisibility.education
      ),
      skills: asBoolean(sectionVisibilityInput.skills, base.sectionVisibility.skills),
    },
    layoutPreferences: {
      experienceOrder: asEnum(
        layoutInput.experienceOrder,
        EXPERIENCE_ORDER,
        base.layoutPreferences.experienceOrder
      ),
      educationOrder: asEnum(
        layoutInput.educationOrder,
        EDUCATION_ORDER,
        base.layoutPreferences.educationOrder
      ),
      sectionOrder: normalizeOrderedValues(
        layoutInput.sectionOrder,
        SECTION_KEYS,
        fallbackSectionOrder
      ),
      contactOrder: normalizeOrderedValues(
        layoutInput.contactOrder,
        CONTACT_FIELD_KEYS,
        fallbackContactOrder
      ) as ContactFieldKey[],
      headerAlignment: {
        name: asEnum(
          headerAlignmentInput.name,
          TEXT_ALIGNMENTS,
          base.layoutPreferences.headerAlignment.name
        ),
        subtitle: asEnum(
          headerAlignmentInput.subtitle,
          TEXT_ALIGNMENTS,
          base.layoutPreferences.headerAlignment.subtitle
        ),
        contact: asEnum(
          headerAlignmentInput.contact,
          TEXT_ALIGNMENTS,
          base.layoutPreferences.headerAlignment.contact
        ),
      },
      fontPreferences: {
        family: asEnum(
          fontPreferencesInput.family,
          FONT_FAMILIES,
          base.layoutPreferences.fontPreferences.family
        ),
        sizes: normalizeFontSizes(
          fontPreferencesInput.sizes,
          base.layoutPreferences.fontPreferences.sizes
        ),
      },
      coverLetterFontPreferences: {
        family: asEnum(
          coverLetterFontPreferencesInput.family,
          FONT_FAMILIES,
          base.layoutPreferences.coverLetterFontPreferences.family
        ),
        sizes: normalizeFontSizes(
          coverLetterFontPreferencesInput.sizes,
          base.layoutPreferences.coverLetterFontPreferences.sizes
        ),
      },
      hyperlinkUnderline: asBoolean(
        layoutInput.hyperlinkUnderline,
        base.layoutPreferences.hyperlinkUnderline
      ),
    },
    coverLetter: {
      date: asString(coverLetterInput.date),
      hiringManager: asString(coverLetterInput.hiringManager),
      companyAddress: asString(coverLetterInput.companyAddress),
      body: asString(coverLetterInput.body),
      sendoff: asString(coverLetterInput.sendoff),
    },
    experience: Array.isArray(input.experience)
      ? input.experience.flatMap((entry) => {
          if (!isRecord(entry)) return [];
          return [
            {
              id: asString(entry.id) || createId(),
              company: asString(entry.company),
              jobTitle: asString(entry.jobTitle),
              location: asString(entry.location),
              startDate: asString(entry.startDate),
              endDate: asString(entry.endDate),
              bullets: asStringArray(entry.bullets),
            },
          ];
        })
      : [],
    projects: Array.isArray(input.projects)
      ? input.projects.flatMap((entry) => {
          if (!isRecord(entry)) return [];
          return [
            {
              id: asString(entry.id) || createId(),
              name: asString(entry.name),
              technologies: asStringArray(entry.technologies),
              bullets: asStringArray(entry.bullets),
            },
          ];
        })
      : [],
    education: Array.isArray(input.education)
      ? input.education.flatMap((entry) => {
          if (!isRecord(entry)) return [];
          return [
            {
              id: asString(entry.id) || createId(),
              degree: asString(entry.degree),
              institution: asString(entry.institution),
              location: asString(entry.location),
              field: asString(entry.field),
              graduationDate: asString(entry.graduationDate),
              gpa: asString(entry.gpa),
              other: asString(entry.other),
            },
          ];
        })
      : [],
    skills: Array.isArray(input.skills)
      ? input.skills.flatMap((entry) => {
          if (!isRecord(entry)) return [];
          return [
            {
              id: asString(entry.id) || createId(),
              name: asString(entry.name),
              category: asString(entry.category),
            },
          ];
        })
      : [],
    hyperlinks: normalizeHyperlinks(input.hyperlinks),
  };
};

const buildAllPaths = (resume: ResumeImportContent) => {
  const paths: string[] = [
    "metadata.fullName",
    "metadata.subtitle",
    "metadata.contactInfo.email",
    "metadata.contactInfo.phone",
    "metadata.contactInfo.location",
    "metadata.contactInfo.linkedin",
    "metadata.contactInfo.website",
    "metadata.contactInfo.github",
    "metadata.summary",
  ];

  resume.experience.forEach((entry, i) => {
    paths.push(
      `experience[${i}].company`,
      `experience[${i}].jobTitle`,
      `experience[${i}].location`,
      `experience[${i}].startDate`,
      `experience[${i}].endDate`
    );
    entry.bullets.forEach((_, j) =>
      paths.push(`experience[${i}].bullets[${j}]`)
    );
  });

  resume.projects.forEach((project, i) => {
    paths.push(`projects[${i}].name`);
    project.technologies.forEach((_, j) =>
      paths.push(`projects[${i}].technologies[${j}]`)
    );
    project.bullets.forEach((_, j) =>
      paths.push(`projects[${i}].bullets[${j}]`)
    );
  });

  resume.education.forEach((entry, i) => {
    paths.push(
      `education[${i}].degree`,
      `education[${i}].institution`,
      `education[${i}].location`,
      `education[${i}].field`,
      `education[${i}].graduationDate`,
      `education[${i}].gpa`,
      `education[${i}].other`
    );
  });

  resume.skills.forEach((_, i) => {
    paths.push(`skills[${i}].name`, `skills[${i}].category`);
  });

  return paths;
};

const ensureFeedbackCoverage = (
  resume: ResumeImportContent,
  fieldFeedback: z.infer<typeof resumeImportSchema>["fieldFeedback"]
) => {
  const feedbackMap = new Map(fieldFeedback.map((entry) => [entry.path, entry]));
  return buildAllPaths(resume).map((path) => {
    const entry = feedbackMap.get(path);
    if (!entry) {
      return {
        path,
        quality: "good" as const,
        improvementSuggestions: [],
      };
    }
    return {
      ...entry,
      quality:
        entry.quality === "needs improvement" ? "needs improvement" : "good",
      improvementSuggestions: entry.improvementSuggestions ?? [],
    };
  });
};

const getPrompt = async () => {
  const filePath = path.join(process.cwd(), "lib", "prompts", "resume-import.md");
  return readFile(filePath, "utf8");
};

const extractText = async (
  buffer: Buffer,
  extension: string
): Promise<string> => {
  if (extension === ".pdf") {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text ?? "";
    } catch {
      throw new Error(
        "Could not read text from this PDF. Please upload a text-based PDF."
      );
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  }
  if (extension === ".docx") {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value ?? "";
    } catch {
      throw new Error("Could not read text from this DOCX file.");
    }
  }
  return buffer.toString("utf8");
};

const parseUploadedJson = (rawJson: string) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return {
      ok: false as const,
      error: "Uploaded JSON is invalid.",
    };
  }

  const resumeDataCandidate =
    isRecord(parsed) && "resumeData" in parsed
      ? parsed.resumeData
      : isRecord(parsed) && "optimizedResume" in parsed
        ? parsed.optimizedResume
        : parsed;
  const normalizedResumeData = normalizeResumeData(resumeDataCandidate);
  if (normalizedResumeData) {
    return {
      ok: true as const,
      response: {
        mode: "resume-data" as const,
        resumeData: normalizedResumeData,
      },
    };
  }

  const parsedImportWithFeedback = resumeImportSchema.safeParse(parsed);
  if (parsedImportWithFeedback.success) {
    const normalizedFeedback = ensureFeedbackCoverage(
      parsedImportWithFeedback.data.resume,
      parsedImportWithFeedback.data.fieldFeedback
    );
    return {
      ok: true as const,
      response: {
        mode: "resume-import" as const,
        resume: parsedImportWithFeedback.data.resume,
        fieldFeedback: normalizedFeedback,
        raw: parsed,
      },
    };
  }

  const parsedImportContent = resumeImportContentSchema.safeParse(parsed);
  if (parsedImportContent.success) {
    const normalizedFeedback = ensureFeedbackCoverage(parsedImportContent.data, []);
    return {
      ok: true as const,
      response: {
        mode: "resume-import" as const,
        resume: parsedImportContent.data,
        fieldFeedback: normalizedFeedback,
        raw: parsed,
      },
    };
  }

  return {
    ok: false as const,
    error:
      "Unsupported JSON format. Upload a config copied from Debug -> Resume JSON.",
  };
};

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Resume file is required." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: "File is too large. Max 5MB." },
        { status: 400 }
      );
    }

    const extension = path.extname(file.name || "").toLowerCase();
    const allowedExtensions = new Set([".pdf", ".docx", ".txt", ".md", ".json"]);

    if (!allowedExtensions.has(extension)) {
      return NextResponse.json(
        { error: "Unsupported file type." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (extension === ".json") {
      const parsed = parseUploadedJson(buffer.toString("utf8"));
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      return NextResponse.json(parsed.response);
    }

    let extractedText = "";
    try {
      extractedText = sanitizeText(await extractText(buffer, extension));
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Could not extract text from the uploaded file.",
        },
        { status: 400 }
      );
    }

    if (!extractedText) {
      return NextResponse.json(
        { error: "Could not extract text from the uploaded file." },
        { status: 400 }
      );
    }

    const system = await getPrompt();

    const result = await generateObject({
      model: AI_MODELS.resumeImport,
      system,
      prompt: `Resume text:\n${extractedText}`,
      schema: resumeImportSchema,
    });

    const normalizedFeedback = ensureFeedbackCoverage(
      result.object.resume,
      result.object.fieldFeedback
    );

    return NextResponse.json({
      mode: "resume-import",
      resume: result.object.resume,
      fieldFeedback: normalizedFeedback,
      raw: result.object,
    });
  } catch (error) {
    console.error("Error importing resume:", error);
    return NextResponse.json(
      { error: "Failed to import resume." },
      { status: 500 }
    );
  }
}
