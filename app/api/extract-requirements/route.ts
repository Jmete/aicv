import { NextResponse } from "next/server";
import { z } from "zod";
import { generateObject, NoObjectGeneratedError } from "ai";
import { AI_MODELS } from "@/lib/ai-models";
import { computeApplyPriorityScoring } from "@/lib/apply-priority-scoring";

export const runtime = "nodejs";

const MAX_JOB_DESCRIPTION_CHARS = 24_000;
const MAX_RESUME_JSON_CHARS = 40_000;
const MAX_COMPACT_RESUME_JSON_CHARS = 18_000;
const MAX_ULTRA_COMPACT_RESUME_JSON_CHARS = 10_000;
const EXTRACTION_MAX_OUTPUT_TOKENS = 10_000;

const REQUIREMENT_EXTRACTION_SYSTEM = `You are an ATS requirement extractor.
Return strict JSON with exactly these top-level keys:
- roleTitle
- roleFamily
- atomicUnits

roleFamily must be one of:
data_science|mlops|data_engineering|product|audit|consulting|governance|other

For each atomic unit include all required fields with valid enum values.
Keep outputs concise:
- canonical <= 5 words
- keep aliases, jdEvidence, gaps minimal
- use empty arrays when evidence is weak
- keep total units concise; prefer 10-18 high-signal units
- matchedResumeRefs max 2
- recommendedTargets max 2
- each recommendedTarget must include:
  - resumeId (an existing resume element id)
  - recommendations (1-2 short truthful edit suggestions)

Never include any top-level keys beyond roleTitle, roleFamily, atomicUnits.
Output JSON only.`;

const requestSchema = z.object({
  jobDescription: z.string().optional().default(""),
  resumeData: z.unknown().optional().nullable().default(null),
});

const roleFamilySchema = z.enum([
  "data_science",
  "mlops",
  "data_engineering",
  "product",
  "audit",
  "consulting",
  "governance",
  "other",
]);

const atomicUnitTypeSchema = z.enum([
  "tool",
  "platform",
  "method",
  "responsibility",
  "domain",
  "governance",
  "leadership",
  "commercial",
  "education",
  "constraint",
]);

const coverageStatusSchema = z.enum(["explicit", "partial", "none"]);
const feasibilitySchema = z.enum(["feasible", "maybe", "not_feasible"]);

const matchedResumeRefSchema = z.object({
  resumeId: z.string().max(80),
  excerpt: z.string().max(180),
  matchStrength: z.number().min(0).max(1),
});

const recommendedTargetSchema = z.object({
  resumeId: z.string().min(1).max(80),
  recommendations: z.array(z.string().min(1).max(160)).min(1).max(3),
});

const atomicUnitSchema = z.object({
  id: z.string().min(1).max(80),
  canonical: z.string().min(1).max(160),
  type: atomicUnitTypeSchema,
  weight: z.number().int().min(0).max(100),
  mustHave: z.boolean(),
  aliases: z.array(z.string().min(1).max(80)).max(3),
  jdEvidence: z.array(z.string().min(1).max(140)).max(2),
  notes: z.string().max(160),
  coverageStatus: coverageStatusSchema,
  feasibility: feasibilitySchema,
  matchedResumeRefs: z.array(matchedResumeRefSchema).max(2),
  recommendedTargets: z.array(recommendedTargetSchema).max(5),
  gaps: z.array(z.string().min(1).max(160)).max(5),
});

const clusterSchema = z.object({
  name: z.string().min(1).max(80),
  unitIds: z.array(z.string().min(1).max(80)).max(40),
  weight: z.number().int().min(0).max(100),
});

const topGapSchema = z.object({
  unitId: z.string().min(1).max(80),
  canonical: z.string().min(1).max(160),
  type: atomicUnitTypeSchema,
  reason: z.string().min(1).max(160),
});

const blockerSchema = z.object({
  unitId: z.string().max(80),
  canonical: z.string().max(160),
  type: atomicUnitTypeSchema,
  reason: z.string().min(1).max(160),
});

const scoringGapSchema = z.object({
  unitId: z.string().max(80),
  canonical: z.string().max(160),
  type: atomicUnitTypeSchema,
  weight: z.number().min(0).max(100),
  effectiveWeight: z.number().min(0).max(120),
  mustHave: z.boolean(),
  coverageStatus: coverageStatusSchema,
  feasibility: feasibilitySchema,
  reason: z.string().min(1).max(160),
});

const applyPrioritySchema = z
  .object({
    CurrentFit: z.number().min(0).max(100),
    AchievableFit: z.number().min(0).max(100),
    ApplyPriority: z.number().min(0).max(100),
    blockerCount: z.number().int().min(0),
    blockerWeightSum: z.number().min(0).max(2400),
    blockers: z.array(blockerSchema.strict()).max(24),
    topFeasibleGaps: z.array(scoringGapSchema.strict()).max(5),
    topNotFeasibleGaps: z.array(scoringGapSchema.strict()).max(5),
  })
  .strict();

const EMPTY_APPLY_PRIORITY = applyPrioritySchema.parse({
  CurrentFit: 0,
  AchievableFit: 0,
  ApplyPriority: 0,
  blockerCount: 0,
  blockerWeightSum: 0,
  blockers: [],
  topFeasibleGaps: [],
  topNotFeasibleGaps: [],
});

const summarySchema = z.object({
  mustHaveCoveredCount: z.number().int().min(0),
  mustHaveTotalCount: z.number().int().min(0),
  niceToHaveCoveredCount: z.number().int().min(0),
  niceToHaveTotalCount: z.number().int().min(0),
  topGaps: z.array(topGapSchema).max(10),
});

const extractionSchema = z.object({
  roleTitle: z.string().max(160),
  roleFamily: roleFamilySchema,
  atomicUnits: z.array(atomicUnitSchema).max(24),
});

const responseSchema = z
  .object({
    roleTitle: z.string(),
    roleFamily: roleFamilySchema,
    budgets: z
      .object({
        maxUnits: z.literal(24),
        maxMustHave: z.literal(14),
        maxNiceToHave: z.literal(10),
      })
      .strict(),
    atomicUnits: z.array(atomicUnitSchema.strict()).max(24),
    clusters: z.array(clusterSchema.strict()),
    summary: summarySchema
      .extend({
        topGaps: z.array(topGapSchema.strict()).max(10),
      })
      .strict(),
    applyPriority: applyPrioritySchema,
  })
  .strict();

const API_OUTPUT_BUDGETS = {
  maxUnits: 24,
  maxMustHave: 14,
  maxNiceToHave: 10,
} as const;

type AtomicUnit = z.infer<typeof atomicUnitSchema>;
type Cluster = z.infer<typeof clusterSchema>;
type TopGap = z.infer<typeof topGapSchema>;
type CoverageStatus = z.infer<typeof coverageStatusSchema>;
type Feasibility = z.infer<typeof feasibilitySchema>;
type MatchedResumeRef = z.infer<typeof matchedResumeRefSchema>;
type RecommendedTarget = z.infer<typeof recommendedTargetSchema>;
type ExtractionObject = z.infer<typeof extractionSchema>;

const sanitize = (value: string) =>
  value.replace(/\u0000/g, "").replace(/\r\n/g, "\n").trim();

const normalizeText = (value: string) => sanitize(value).replace(/\s+/g, " ");

const clampWeight = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const clampMatchStrength = (value: number) =>
  Math.max(0, Math.min(1, Math.round(value * 1000) / 1000));

const toStableId = (value: string) => {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const suffix = normalized ? normalized.slice(0, 48) : "unit";
  return `u_${suffix}`;
};

const uniqueStrings = (values: unknown[], maxItems: number, maxLength: number) => {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const normalized = normalizeText(value).slice(0, maxLength);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
    if (output.length >= maxItems) break;
  }
  return output;
};

const COVERAGE_SCORE: Record<CoverageStatus, number> = {
  explicit: 3,
  partial: 2,
  none: 1,
};

const FEASIBILITY_SCORE: Record<Feasibility, number> = {
  feasible: 3,
  maybe: 2,
  not_feasible: 1,
};

const normalizeMatchedResumeRefs = (values: MatchedResumeRef[]) => {
  const deduped = new Map<string, MatchedResumeRef>();
  for (const value of values ?? []) {
    const excerpt = normalizeText(value.excerpt).slice(0, 180);
    const resumeId = normalizeText(value.resumeId).slice(0, 80);
    if (!resumeId && !excerpt) continue;
    const normalized = {
      resumeId,
      excerpt,
      matchStrength: clampMatchStrength(value.matchStrength),
    };
    const key = `${normalized.resumeId.toLowerCase()}|${normalized.excerpt.toLowerCase()}`;
    const existing = deduped.get(key);
    if (!existing || normalized.matchStrength > existing.matchStrength) {
      deduped.set(key, normalized);
    }
  }
  return Array.from(deduped.values())
    .sort((a, b) => b.matchStrength - a.matchStrength)
    .slice(0, 2);
};

const mergeRecommendedTargets = (values: RecommendedTarget[]) => {
  const deduped = new Map<string, RecommendedTarget>();
  for (const value of values ?? []) {
    const resumeId = normalizeText(value.resumeId).slice(0, 80);
    if (!resumeId) continue;
    const recommendations = uniqueStrings(
      value.recommendations ?? [],
      3,
      160
    ).slice(0, 3);
    if (!recommendations.length) continue;
    const existing = deduped.get(resumeId);
    if (!existing) {
      deduped.set(resumeId, { resumeId, recommendations });
      continue;
    }
    deduped.set(resumeId, {
      resumeId,
      recommendations: uniqueStrings(
        [...existing.recommendations, ...recommendations],
        3,
        160
      ),
    });
  }
  return Array.from(deduped.values()).slice(0, 5);
};

const buildFallbackRecommendedTargets = ({
  matchedResumeRefs,
  canonical,
  gaps,
}: {
  matchedResumeRefs: MatchedResumeRef[];
  canonical: string;
  gaps: string[];
}) => {
  const baseRecommendations = uniqueStrings(
    [
      gaps[0],
      canonical
        ? `Add truthful resume wording that explicitly demonstrates ${canonical}.`
        : "",
    ],
    2,
    160
  );

  if (!baseRecommendations.length) return [];

  const targets: RecommendedTarget[] = [];
  for (const ref of matchedResumeRefs.slice(0, 2)) {
    const resumeId = normalizeText(ref.resumeId).slice(0, 80);
    if (!resumeId) continue;
    targets.push({
      resumeId,
      recommendations: baseRecommendations,
    });
  }
  return mergeRecommendedTargets(targets);
};

const normalizeAtomicUnit = (raw: AtomicUnit): AtomicUnit | null => {
  const canonical = normalizeText(raw.canonical);
  if (!canonical) return null;
  const id = normalizeText(raw.id) || toStableId(canonical);
  const matchedResumeRefs = normalizeMatchedResumeRefs(raw.matchedResumeRefs ?? []);
  const gaps = uniqueStrings(raw.gaps ?? [], 5, 160);
  const recommendedTargets = mergeRecommendedTargets(raw.recommendedTargets ?? []);
  return {
    id,
    canonical,
    type: raw.type,
    weight: clampWeight(raw.weight),
    mustHave: Boolean(raw.mustHave),
    aliases: uniqueStrings(raw.aliases ?? [], 3, 80).filter(
      (alias) => alias.toLowerCase() !== canonical.toLowerCase()
    ),
    jdEvidence: uniqueStrings(raw.jdEvidence ?? [], 2, 140),
    notes: normalizeText(raw.notes).slice(0, 160),
    coverageStatus: raw.coverageStatus,
    feasibility: raw.feasibility,
    matchedResumeRefs,
    recommendedTargets:
      recommendedTargets.length > 0
        ? recommendedTargets
        : buildFallbackRecommendedTargets({
            matchedResumeRefs,
            canonical,
            gaps,
          }),
    gaps,
  };
};

const mergeAtomicUnits = (current: AtomicUnit, incoming: AtomicUnit) => {
  const preferred = incoming.weight > current.weight ? incoming : current;
  const coverageStatus =
    COVERAGE_SCORE[incoming.coverageStatus] >= COVERAGE_SCORE[current.coverageStatus]
      ? incoming.coverageStatus
      : current.coverageStatus;
  const feasibility =
    FEASIBILITY_SCORE[incoming.feasibility] >= FEASIBILITY_SCORE[current.feasibility]
      ? incoming.feasibility
      : current.feasibility;
  const matchedResumeRefs = normalizeMatchedResumeRefs([
    ...current.matchedResumeRefs,
    ...incoming.matchedResumeRefs,
  ]);
  const gaps = uniqueStrings([...current.gaps, ...incoming.gaps], 5, 160);
  const canonical = preferred.canonical;
  const recommendedTargets = mergeRecommendedTargets([
    ...current.recommendedTargets,
    ...incoming.recommendedTargets,
  ]);
  return {
    ...preferred,
    mustHave: current.mustHave || incoming.mustHave,
    aliases: uniqueStrings([...current.aliases, ...incoming.aliases], 3, 80),
    jdEvidence: uniqueStrings([...current.jdEvidence, ...incoming.jdEvidence], 2, 140),
    notes: preferred.notes || (preferred === current ? incoming.notes : current.notes),
    coverageStatus,
    feasibility,
    matchedResumeRefs,
    recommendedTargets:
      recommendedTargets.length > 0
        ? recommendedTargets
        : buildFallbackRecommendedTargets({
            matchedResumeRefs,
            canonical,
            gaps,
          }),
    gaps,
  };
};

const sortAtomicUnits = (items: AtomicUnit[]) =>
  items.sort((a, b) => {
    if (a.mustHave !== b.mustHave) return a.mustHave ? -1 : 1;
    if (b.weight !== a.weight) return b.weight - a.weight;
    return a.canonical.localeCompare(b.canonical);
  });

const enforceBudgets = (items: AtomicUnit[]) => {
  const sorted = sortAtomicUnits([...items]);
  const mustHave = sorted
    .filter((item) => item.mustHave)
    .slice(0, API_OUTPUT_BUDGETS.maxMustHave);
  const niceToHave = sorted
    .filter((item) => !item.mustHave)
    .slice(0, API_OUTPUT_BUDGETS.maxNiceToHave);
  return sortAtomicUnits([...mustHave, ...niceToHave]).slice(
    0,
    API_OUTPUT_BUDGETS.maxUnits
  );
};

const buildFallbackClusters = (atomicUnits: AtomicUnit[]): Cluster[] => {
  const grouped = new Map<string, { unitIds: string[]; weight: number }>();
  for (const unit of atomicUnits) {
    const bucket = grouped.get(unit.type);
    if (bucket) {
      bucket.unitIds.push(unit.id);
      bucket.weight = Math.max(bucket.weight, unit.weight);
      continue;
    }
    grouped.set(unit.type, { unitIds: [unit.id], weight: unit.weight });
  }
  return Array.from(grouped.entries())
    .map(([name, value]) => ({
      name,
      unitIds: uniqueStrings(value.unitIds, 40, 80),
      weight: value.weight,
    }))
    .sort((a, b) => {
      if (b.weight !== a.weight) return b.weight - a.weight;
      return a.name.localeCompare(b.name);
    })
    .slice(0, 8);
};

const buildSummary = (atomicUnits: AtomicUnit[]) => {
  const mustHaveTotalCount = atomicUnits.filter((unit) => unit.mustHave).length;
  const mustHaveCoveredCount = atomicUnits.filter(
    (unit) => unit.mustHave && unit.coverageStatus === "explicit"
  ).length;
  const niceToHaveTotalCount = atomicUnits.filter((unit) => !unit.mustHave).length;
  const niceToHaveCoveredCount = atomicUnits.filter(
    (unit) => !unit.mustHave && unit.coverageStatus !== "none"
  ).length;

  const topGaps: TopGap[] = [...atomicUnits]
    .filter(
      (unit) => unit.coverageStatus !== "explicit" || unit.feasibility !== "feasible"
    )
    .sort((a, b) => {
      if (a.mustHave !== b.mustHave) return a.mustHave ? -1 : 1;
      if (a.coverageStatus !== b.coverageStatus) {
        return COVERAGE_SCORE[a.coverageStatus] - COVERAGE_SCORE[b.coverageStatus];
      }
      if (a.feasibility !== b.feasibility) {
        return FEASIBILITY_SCORE[a.feasibility] - FEASIBILITY_SCORE[b.feasibility];
      }
      return b.weight - a.weight;
    })
    .slice(0, 10)
    .map((unit) => ({
      unitId: unit.id,
      canonical: unit.canonical,
      type: unit.type,
      reason:
        unit.gaps[0] ||
        (unit.coverageStatus === "none"
          ? "No resume evidence found"
          : unit.coverageStatus === "partial"
            ? "Only partial resume evidence found"
            : "Feasibility is limited"),
    }));

  return {
    mustHaveCoveredCount,
    mustHaveTotalCount,
    niceToHaveCoveredCount,
    niceToHaveTotalCount,
    topGaps,
  };
};

const safeStringify = (value: unknown) => {
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === "string" ? serialized : "{}";
  } catch {
    return "{}";
  }
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const compactText = (value: unknown, maxLength: number) => {
  if (typeof value !== "string") return "";
  return normalizeText(value).slice(0, maxLength);
};

const compactTextArray = (value: unknown, maxItems: number, maxLength: number) => {
  if (!Array.isArray(value)) return [];
  const output: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const next = compactText(item, maxLength);
    if (!next) continue;
    output.push(next);
    if (output.length >= maxItems) break;
  }
  return output;
};

const buildCompactResumeData = (resumeData: unknown) => {
  if (!isObject(resumeData)) return {};

  const metadataRaw = isObject(resumeData.metadata) ? resumeData.metadata : null;
  const contactRaw =
    metadataRaw && isObject(metadataRaw.contactInfo) ? metadataRaw.contactInfo : null;

  const experienceRaw = Array.isArray(resumeData.experience)
    ? resumeData.experience
    : [];
  const projectsRaw = Array.isArray(resumeData.projects) ? resumeData.projects : [];
  const educationRaw = Array.isArray(resumeData.education) ? resumeData.education : [];
  const skillsRaw = Array.isArray(resumeData.skills) ? resumeData.skills : [];

  return {
    metadata: {
      fullName: compactText(metadataRaw?.fullName, 120),
      subtitle: compactText(metadataRaw?.subtitle, 220),
      summary: compactText(metadataRaw?.summary, 320),
      contactInfo: {
        email: compactText(contactRaw?.email, 120),
        phone: compactText(contactRaw?.phone, 60),
        location: compactText(contactRaw?.location, 120),
        linkedin: compactText(contactRaw?.linkedin, 200),
        website: compactText(contactRaw?.website, 200),
        github: compactText(contactRaw?.github, 200),
      },
    },
    experience: experienceRaw
      .slice(0, 8)
      .map((entry) => {
        if (!isObject(entry)) return null;
        return {
          id: compactText(entry.id, 80),
          company: compactText(entry.company, 120),
          jobTitle: compactText(entry.jobTitle, 120),
          location: compactText(entry.location, 120),
          startDate: compactText(entry.startDate, 40),
          endDate: compactText(entry.endDate, 40),
          bullets: compactTextArray(entry.bullets, 4, 180),
        };
      })
      .filter((entry) => entry !== null),
    projects: projectsRaw
      .slice(0, 6)
      .map((entry) => {
        if (!isObject(entry)) return null;
        return {
          id: compactText(entry.id, 80),
          name: compactText(entry.name, 120),
          technologies: compactTextArray(entry.technologies, 8, 80),
          bullets: compactTextArray(entry.bullets, 3, 180),
        };
      })
      .filter((entry) => entry !== null),
    education: educationRaw
      .slice(0, 4)
      .map((entry) => {
        if (!isObject(entry)) return null;
        return {
          id: compactText(entry.id, 80),
          degree: compactText(entry.degree, 120),
          institution: compactText(entry.institution, 120),
          field: compactText(entry.field, 120),
          graduationDate: compactText(entry.graduationDate, 40),
        };
      })
      .filter((entry) => entry !== null),
    skills: skillsRaw
      .slice(0, 40)
      .map((entry) => {
        if (!isObject(entry)) return null;
        return {
          id: compactText(entry.id, 80),
          name: compactText(entry.name, 100),
          category: compactText(entry.category, 80),
        };
      })
      .filter((entry) => entry !== null),
  };
};

const buildUltraCompactResumeData = (resumeData: unknown) => {
  if (!isObject(resumeData)) return {};

  const metadataRaw = isObject(resumeData.metadata) ? resumeData.metadata : null;
  const experienceRaw = Array.isArray(resumeData.experience)
    ? resumeData.experience
    : [];
  const skillsRaw = Array.isArray(resumeData.skills) ? resumeData.skills : [];

  return {
    metadata: {
      subtitle: compactText(metadataRaw?.subtitle, 180),
      summary: compactText(metadataRaw?.summary, 220),
    },
    experience: experienceRaw
      .slice(0, 5)
      .map((entry) => {
        if (!isObject(entry)) return null;
        return {
          id: compactText(entry.id, 80),
          jobTitle: compactText(entry.jobTitle, 100),
          company: compactText(entry.company, 100),
          bullets: compactTextArray(entry.bullets, 2, 140),
        };
      })
      .filter((entry) => entry !== null),
    skills: skillsRaw
      .slice(0, 25)
      .map((entry) => {
        if (!isObject(entry)) return null;
        return {
          id: compactText(entry.id, 80),
          name: compactText(entry.name, 80),
        };
      })
      .filter((entry) => entry !== null),
  };
};

const buildExtractionPrompt = ({
  jobDescription,
  resumeJson,
  compactMode,
}: {
  jobDescription: string;
  resumeJson: string;
  compactMode: boolean;
}) => {
  const outputShapeInstruction =
    "\n\nOutput only these top-level keys: roleTitle, roleFamily, atomicUnits. Do not include budgets, clusters, or summary.";
  const compactInstruction = compactMode
    ? "\n\nCompact-output mode: keep strings very short; avoid verbose excerpts; keep arrays minimal unless critical."
    : "";
  return `Job description:\n${jobDescription}\n\nResume JSON:\n${resumeJson}${outputShapeInstruction}${compactInstruction}`;
};

const isNoObjectParseFailure = (error: unknown) =>
  NoObjectGeneratedError.isInstance(error) ||
  (error instanceof Error &&
    /no object generated|could not parse the response/i.test(error.message));

export async function POST(request: Request) {
  try {
    const payload = requestSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json(
        { error: "Invalid request payload." },
        { status: 400 }
      );
    }

    const cleanJobDescription = sanitize(payload.data.jobDescription).slice(
      0,
      MAX_JOB_DESCRIPTION_CHARS
    );
    if (!cleanJobDescription) {
      return NextResponse.json(
        { error: "Provide a job description first." },
        { status: 400 }
      );
    }

    const cleanResumeJson = sanitize(
      safeStringify(payload.data.resumeData ?? {})
    ).slice(0, MAX_RESUME_JSON_CHARS);

    const compactResumeJson = sanitize(
      safeStringify(buildCompactResumeData(payload.data.resumeData ?? {}))
    ).slice(0, MAX_COMPACT_RESUME_JSON_CHARS);

    const ultraCompactResumeJson = sanitize(
      safeStringify(buildUltraCompactResumeData(payload.data.resumeData ?? {}))
    ).slice(0, MAX_ULTRA_COMPACT_RESUME_JSON_CHARS);

    const runExtraction = async ({
      attempt,
      resumeJson,
      compactMode,
    }: {
      attempt: "primary" | "compact_retry" | "ultra_compact_retry";
      resumeJson: string;
      compactMode: boolean;
    }) => {
      const prompt = buildExtractionPrompt({
        jobDescription: cleanJobDescription,
        resumeJson,
        compactMode,
      });
      console.info("Requirement extraction attempt", {
        attempt,
        jobDescriptionChars: cleanJobDescription.length,
        resumeJsonChars: resumeJson.length,
        systemChars: REQUIREMENT_EXTRACTION_SYSTEM.length,
        promptChars: prompt.length,
      });
      return generateObject({
        model: AI_MODELS.requirementExtraction,
        system: REQUIREMENT_EXTRACTION_SYSTEM,
        prompt,
        schema: extractionSchema,
        maxOutputTokens: EXTRACTION_MAX_OUTPUT_TOKENS,
        providerOptions: {
          openai: {
            reasoningEffort: "minimal",
            textVerbosity: "low",
          },
        },
      });
    };

    let extraction: ExtractionObject;
    try {
      const primary = await runExtraction({
        attempt: "primary",
        resumeJson: cleanResumeJson,
        compactMode: false,
      });
      extraction = primary.object;
    } catch (firstError) {
      if (!isNoObjectParseFailure(firstError)) throw firstError;

      if (NoObjectGeneratedError.isInstance(firstError)) {
        console.warn("Retrying extraction with compact resume payload.", {
          finishReason: firstError.finishReason,
          generatedTextChars: firstError.text?.length ?? 0,
        });
      }

      try {
        const retry = await runExtraction({
          attempt: "compact_retry",
          resumeJson: compactResumeJson,
          compactMode: true,
        });
        extraction = retry.object;
      } catch (secondError) {
        if (!isNoObjectParseFailure(secondError)) throw secondError;

        if (NoObjectGeneratedError.isInstance(secondError)) {
          console.warn("Retrying extraction with ultra-compact resume payload.", {
            finishReason: secondError.finishReason,
            generatedTextChars: secondError.text?.length ?? 0,
          });
        }

        const finalRetry = await runExtraction({
          attempt: "ultra_compact_retry",
          resumeJson: ultraCompactResumeJson,
          compactMode: true,
        });
        extraction = finalRetry.object;
      }
    }

    const deduped = new Map<string, AtomicUnit>();
    for (const rawItem of extraction.atomicUnits ?? []) {
      const normalized = normalizeAtomicUnit(rawItem);
      if (!normalized) continue;
      const key = normalized.canonical.toLowerCase();
      const existing = deduped.get(key);
      deduped.set(
        key,
        existing ? mergeAtomicUnits(existing, normalized) : normalized
      );
    }

    const atomicUnits = enforceBudgets(Array.from(deduped.values()));
    const clusters = buildFallbackClusters(atomicUnits);

    const computedScoring = computeApplyPriorityScoring(atomicUnits);
    const parsedScoring = applyPrioritySchema.safeParse(computedScoring);
    const applyPriority = parsedScoring.success
      ? parsedScoring.data
      : EMPTY_APPLY_PRIORITY;

    const responseBody = responseSchema.parse({
      roleTitle: normalizeText(extraction.roleTitle).slice(0, 160),
      roleFamily: extraction.roleFamily,
      budgets: API_OUTPUT_BUDGETS,
      atomicUnits,
      clusters,
      summary: buildSummary(atomicUnits),
      applyPriority,
    });

    return NextResponse.json(responseBody);
  } catch (error) {
    let details = "";
    if (NoObjectGeneratedError.isInstance(error)) {
      console.error("Error extracting weighted requirements:", {
        message: error.message,
        finishReason: error.finishReason,
        generatedTextChars: error.text?.length ?? 0,
      });
      const snippet = typeof error.text === "string" ? error.text.slice(0, 160) : "";
      details = normalizeText(
        `${error.message} finishReason=${error.finishReason ?? "unknown"} textChars=${error.text?.length ?? 0}${snippet ? ` snippet=${snippet}` : ""}`
      ).slice(0, 500);
    } else {
      console.error("Error extracting weighted requirements:", error);
      details = error instanceof Error ? normalizeText(error.message).slice(0, 500) : "";
    }
    return NextResponse.json(
      { error: "Failed to extract requirements.", details },
      { status: 500 }
    );
  }
}
