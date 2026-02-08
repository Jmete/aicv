import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { generateObject } from "ai";
import { AI_MODELS } from "@/lib/ai-models";

export const runtime = "nodejs";

const MAX_JOB_DESCRIPTION_CHARS = 24_000;
const MAX_RESUME_JSON_CHARS = 40_000;

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
  path: z.string().max(220),
  resumeId: z.string().max(80),
  excerpt: z.string().max(240),
  matchStrength: z.number().min(0).max(1),
});

const atomicUnitSchema = z.object({
  id: z.string().min(1).max(80),
  canonical: z.string().min(1).max(160),
  type: atomicUnitTypeSchema,
  weight: z.number().int().min(0).max(100),
  mustHave: z.boolean(),
  aliases: z.array(z.string().min(1).max(80)).max(6),
  jdEvidence: z.array(z.string().min(1).max(160)).max(3),
  notes: z.string().max(160),
  coverageStatus: coverageStatusSchema,
  feasibility: feasibilitySchema,
  matchedResumeRefs: z.array(matchedResumeRefSchema).max(3),
  recommendedTargetPaths: z.array(z.string().min(1).max(220)).max(10),
  gaps: z.array(z.string().min(1).max(160)).max(10),
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
  budgets: z.object({
    maxUnits: z.number().int().min(1).max(24),
    maxMustHave: z.number().int().min(0).max(24),
    maxNiceToHave: z.number().int().min(0).max(24),
  }),
  atomicUnits: z.array(atomicUnitSchema).max(48),
  clusters: z.array(clusterSchema).max(16),
  summary: summarySchema,
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

const getPrompt = async () => {
  const filePath = path.join(
    process.cwd(),
    "lib",
    "prompts",
    "extract-requirements.md"
  );
  return readFile(filePath, "utf8");
};

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
    const path = normalizeText(value.path).slice(0, 220);
    const excerpt = normalizeText(value.excerpt).slice(0, 240);
    if (!path && !excerpt) continue;
    const normalized = {
      path,
      resumeId: normalizeText(value.resumeId).slice(0, 80),
      excerpt,
      matchStrength: clampMatchStrength(value.matchStrength),
    };
    const key = `${normalized.path.toLowerCase()}|${normalized.excerpt.toLowerCase()}`;
    const existing = deduped.get(key);
    if (!existing || normalized.matchStrength > existing.matchStrength) {
      deduped.set(key, normalized);
    }
  }
  return Array.from(deduped.values())
    .sort((a, b) => b.matchStrength - a.matchStrength)
    .slice(0, 3);
};

const normalizeAtomicUnit = (raw: AtomicUnit): AtomicUnit | null => {
  const canonical = normalizeText(raw.canonical);
  if (!canonical) return null;
  const id = normalizeText(raw.id) || toStableId(canonical);
  return {
    id,
    canonical,
    type: raw.type,
    weight: clampWeight(raw.weight),
    mustHave: Boolean(raw.mustHave),
    aliases: uniqueStrings(raw.aliases ?? [], 6, 80).filter(
      (alias) => alias.toLowerCase() !== canonical.toLowerCase()
    ),
    jdEvidence: uniqueStrings(raw.jdEvidence ?? [], 3, 160),
    notes: normalizeText(raw.notes).slice(0, 160),
    coverageStatus: raw.coverageStatus,
    feasibility: raw.feasibility,
    matchedResumeRefs: normalizeMatchedResumeRefs(raw.matchedResumeRefs ?? []),
    recommendedTargetPaths: uniqueStrings(raw.recommendedTargetPaths ?? [], 10, 220),
    gaps: uniqueStrings(raw.gaps ?? [], 10, 160),
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
  return {
    ...preferred,
    mustHave: current.mustHave || incoming.mustHave,
    aliases: uniqueStrings([...current.aliases, ...incoming.aliases], 6, 80),
    jdEvidence: uniqueStrings([...current.jdEvidence, ...incoming.jdEvidence], 3, 160),
    notes: preferred.notes || (preferred === current ? incoming.notes : current.notes),
    coverageStatus,
    feasibility,
    matchedResumeRefs,
    recommendedTargetPaths: uniqueStrings(
      [...current.recommendedTargetPaths, ...incoming.recommendedTargetPaths],
      10,
      220
    ),
    gaps: uniqueStrings([...current.gaps, ...incoming.gaps], 10, 160),
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

const normalizeCluster = (
  raw: Cluster,
  validUnitIds: Set<string>
): Cluster | null => {
  const name = normalizeText(raw.name);
  if (!name) return null;
  const unitIds = uniqueStrings(raw.unitIds ?? [], 40, 80).filter((id) =>
    validUnitIds.has(id)
  );
  if (!unitIds.length) return null;
  return {
    name,
    unitIds,
    weight: clampWeight(raw.weight),
  };
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

    const system = await getPrompt();
    const result = await generateObject({
      model: AI_MODELS.requirementExtraction,
      system,
      prompt: `Job description:\n${cleanJobDescription}\n\nResume JSON:\n${cleanResumeJson}`,
      schema: extractionSchema,
    });

    const deduped = new Map<string, AtomicUnit>();
    for (const rawItem of result.object.atomicUnits ?? []) {
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
    const validUnitIds = new Set(atomicUnits.map((unit) => unit.id));

    const clusterMap = new Map<string, Cluster>();
    for (const rawCluster of result.object.clusters ?? []) {
      const normalized = normalizeCluster(rawCluster, validUnitIds);
      if (!normalized) continue;
      const key = normalized.name.toLowerCase();
      const existing = clusterMap.get(key);
      if (!existing) {
        clusterMap.set(key, normalized);
        continue;
      }
      clusterMap.set(key, {
        name: existing.name,
        unitIds: uniqueStrings([...existing.unitIds, ...normalized.unitIds], 40, 80),
        weight: Math.max(existing.weight, normalized.weight),
      });
    }

    const clusters =
      clusterMap.size > 0
        ? Array.from(clusterMap.values())
            .sort((a, b) => {
              if (b.weight !== a.weight) return b.weight - a.weight;
              return a.name.localeCompare(b.name);
            })
            .slice(0, 8)
        : buildFallbackClusters(atomicUnits);

    const responseBody = responseSchema.parse({
      roleTitle: normalizeText(result.object.roleTitle).slice(0, 160),
      roleFamily: result.object.roleFamily,
      budgets: API_OUTPUT_BUDGETS,
      atomicUnits,
      clusters,
      summary: buildSummary(atomicUnits),
    });

    return NextResponse.json(responseBody);
  } catch (error) {
    console.error("Error extracting weighted requirements:", error);
    return NextResponse.json(
      { error: "Failed to extract requirements." },
      { status: 500 }
    );
  }
}
