import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { generateObject } from "ai";
import { AI_MODELS } from "@/lib/ai-models";

export const runtime = "nodejs";

const MAX_JOB_DESCRIPTION_CHARS = 24_000;

const requestSchema = z.object({
  jobDescription: z.string().optional().default(""),
});

const requirementSchema = z.object({
  requirement: z.string().min(1).max(160),
  weight: z.number().int().min(1).max(100),
});

const responseSchema = z.object({
  requirements: z.array(requirementSchema).max(40),
});

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

const normalizeRequirementText = (value: string) =>
  sanitize(value).replace(/\s+/g, " ");

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
    const result = await generateObject({
      model: AI_MODELS.requirementExtraction,
      system,
      prompt: `Job description:\n${cleanJobDescription}`,
      schema: responseSchema,
    });

    const deduped = new Map<string, z.infer<typeof requirementSchema>>();
    for (const rawItem of result.object.requirements ?? []) {
      const requirement = normalizeRequirementText(rawItem.requirement);
      if (!requirement) continue;
      const key = requirement.toLowerCase();
      const normalized = {
        requirement,
        weight: Math.max(1, Math.min(100, Math.round(rawItem.weight))),
      };
      const existing = deduped.get(key);
      if (!existing || normalized.weight > existing.weight) {
        deduped.set(key, normalized);
      }
    }

    const requirements = Array.from(deduped.values()).sort((a, b) => {
      if (b.weight !== a.weight) return b.weight - a.weight;
      return a.requirement.localeCompare(b.requirement);
    });

    return NextResponse.json({ requirements });
  } catch (error) {
    console.error("Error extracting weighted requirements:", error);
    return NextResponse.json(
      { error: "Failed to extract requirements." },
      { status: 500 }
    );
  }
}
