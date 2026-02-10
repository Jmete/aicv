import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { generateObject, NoObjectGeneratedError } from "ai";
import { AI_MODELS } from "@/lib/ai-models";

export const runtime = "nodejs";

const MAX_JOB_DESCRIPTION_CHARS = 24_000;
const EXTRACTION_MAX_OUTPUT_TOKENS = 4_000;
const MAX_EXTRACTION_ATTEMPTS = 3;

const OUTPUT_BUDGETS = {
  maxRequirements: 24,
  maxMustHave: 14,
  maxNiceToHave: 10,
} as const;

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

const requirementTypeSchema = z.enum([
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

const requirementSchema = z
  .object({
    id: z.string().min(1).max(80),
    canonical: z.string().min(1).max(160),
    type: requirementTypeSchema,
    weight: z.number().int().min(0).max(100),
    mustHave: z.boolean(),
    aliases: z.array(z.string().min(1).max(80)).max(5),
    jdEvidence: z.array(z.string().min(1).max(180)).max(3),
  })
  .strict();

const extractionSchema = z
  .object({
    roleTitle: z.string().max(160),
    roleFamily: roleFamilySchema,
    requirements: z.array(requirementSchema).max(OUTPUT_BUDGETS.maxRequirements),
  })
  .strict();

const responseSchema = extractionSchema;

type Requirement = z.infer<typeof requirementSchema>;
type ExtractionObject = z.infer<typeof extractionSchema>;

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

const normalizeCanonical = (value: string) =>
  normalizeText(value)
    .replace(/[;,/()]/g, " ")
    .replace(/\band\/or\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);

const normalizeAlias = (value: string) => normalizeCanonical(value).slice(0, 80);

const clampWeight = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const toStableId = (value: string) => {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const suffix = normalized ? normalized.slice(0, 48) : "requirement";
  return `req_${suffix}`;
};

const uniqueStrings = (
  values: unknown[],
  maxItems: number,
  maxLength: number,
  cleaner: (value: string) => string = normalizeText
) => {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    if (typeof value !== "string") continue;
    const normalized = cleaner(value).slice(0, maxLength);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
    if (output.length >= maxItems) break;
  }

  return output;
};

const normalizeRequirement = (raw: Requirement): Requirement | null => {
  const canonical = normalizeCanonical(raw.canonical);
  if (!canonical) return null;

  const normalizedId = normalizeText(raw.id)
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 80);

  return {
    id: normalizedId || toStableId(canonical),
    canonical,
    type: raw.type,
    weight: clampWeight(raw.weight),
    mustHave: Boolean(raw.mustHave),
    aliases: uniqueStrings(raw.aliases ?? [], 5, 80, normalizeAlias).filter(
      (alias) => alias.toLowerCase() !== canonical.toLowerCase()
    ),
    jdEvidence: uniqueStrings(raw.jdEvidence ?? [], 3, 180),
  };
};

const mergeRequirements = (current: Requirement, incoming: Requirement): Requirement => {
  const preferred = incoming.weight > current.weight ? incoming : current;

  return {
    ...preferred,
    mustHave: current.mustHave || incoming.mustHave,
    aliases: uniqueStrings(
      [...current.aliases, ...incoming.aliases],
      5,
      80,
      normalizeAlias
    ).filter((alias) => alias.toLowerCase() !== preferred.canonical.toLowerCase()),
    jdEvidence: uniqueStrings([...current.jdEvidence, ...incoming.jdEvidence], 3, 180),
  };
};

const sortRequirements = (items: Requirement[]) =>
  items.sort((a, b) => {
    if (a.mustHave !== b.mustHave) return a.mustHave ? -1 : 1;
    if (b.weight !== a.weight) return b.weight - a.weight;
    return a.canonical.localeCompare(b.canonical);
  });

const enforceBudgets = (items: Requirement[]) => {
  const sorted = sortRequirements([...items]);

  const mustHave = sorted
    .filter((item) => item.mustHave)
    .slice(0, OUTPUT_BUDGETS.maxMustHave);

  const niceToHave = sorted
    .filter((item) => !item.mustHave)
    .slice(0, OUTPUT_BUDGETS.maxNiceToHave);

  return sortRequirements([...mustHave, ...niceToHave]).slice(
    0,
    OUTPUT_BUDGETS.maxRequirements
  );
};

const buildExtractionPrompt = (jobDescription: string) => {
  return [
    `Job description:\n${jobDescription}`,
    "Return strict JSON only with exactly these top-level keys: roleTitle, roleFamily, requirements.",
    "Do not include markdown, prose, or any extra keys.",
  ].join("\n\n");
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

    const system = await getPrompt();
    const basePrompt = buildExtractionPrompt(cleanJobDescription);

    let extraction: ExtractionObject | null = null;
    let repairGuidance = "";

    for (let attempt = 1; attempt <= MAX_EXTRACTION_ATTEMPTS; attempt += 1) {
      try {
        const prompt = [basePrompt, repairGuidance].filter(Boolean).join("\n\n");
        const result = await generateObject({
          model: AI_MODELS.requirementExtraction,
          system,
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

        extraction = result.object;
        break;
      } catch (error) {
        if (!isNoObjectParseFailure(error) || attempt === MAX_EXTRACTION_ATTEMPTS) {
          throw error;
        }

        if (NoObjectGeneratedError.isInstance(error)) {
          console.warn("Retrying requirement extraction after parse failure.", {
            attempt,
            finishReason: error.finishReason,
            generatedTextChars: error.text?.length ?? 0,
          });
        }

        repairGuidance =
          "Your previous output did not match the required JSON schema. Return only JSON with roleTitle, roleFamily, and requirements fields.";
      }
    }

    if (!extraction) {
      throw new Error("Extraction failed.");
    }

    const deduped = new Map<string, Requirement>();
    for (const rawRequirement of extraction.requirements ?? []) {
      const normalized = normalizeRequirement(rawRequirement);
      if (!normalized) continue;

      const key = normalized.canonical.toLowerCase();
      const existing = deduped.get(key);
      deduped.set(
        key,
        existing ? mergeRequirements(existing, normalized) : normalized
      );
    }

    const responseBody = responseSchema.parse({
      roleTitle: normalizeText(extraction.roleTitle).slice(0, 160),
      roleFamily: extraction.roleFamily,
      requirements: enforceBudgets(Array.from(deduped.values())),
    });

    return NextResponse.json(responseBody);
  } catch (error) {
    let details = "";

    if (NoObjectGeneratedError.isInstance(error)) {
      console.error("Error extracting requirements:", {
        message: error.message,
        finishReason: error.finishReason,
        generatedTextChars: error.text?.length ?? 0,
      });

      const snippet =
        typeof error.text === "string" ? error.text.slice(0, 160) : "";

      details = normalizeText(
        `${error.message} finishReason=${error.finishReason ?? "unknown"} textChars=${error.text?.length ?? 0}${snippet ? ` snippet=${snippet}` : ""}`
      ).slice(0, 500);
    } else {
      console.error("Error extracting requirements:", error);
      details =
        error instanceof Error ? normalizeText(error.message).slice(0, 500) : "";
    }

    return NextResponse.json(
      { error: "Failed to extract requirements.", details },
      { status: 500 }
    );
  }
}
