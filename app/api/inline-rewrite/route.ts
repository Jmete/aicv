import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import {
  estimateWrappedLineCount,
  type FieldLengthConstraint,
} from "@/lib/line-constraints";

export const runtime = "nodejs";
const MAX_INLINE_ATTEMPTS = 3;

const lengthConstraintSchema = z.object({
  maxLines: z.number().int().positive(),
  maxCharsPerLine: z.number().int().positive(),
  maxCharsTotal: z.number().int().positive(),
  availableWidthPx: z.number().positive(),
  fontSizePx: z.number().positive(),
  fontFamily: z.string().min(1),
  safetyBuffer: z.number().positive().max(1),
});

const requestSchema = z.object({
  text: z.string(),
  instruction: z.string().min(1),
  context: z.record(z.string(), z.unknown()).optional(),
  lengthConstraint: lengthConstraintSchema.optional(),
});

const responseSchema = z.object({
  replacement: z.string(),
});

const getPrompt = async () => {
  const filePath = path.join(process.cwd(), "lib", "prompts", "inline-rewrite.md");
  return readFile(filePath, "utf8");
};

const sanitize = (value: string) =>
  value.replace(/\u0000/g, "").replace(/\r\n/g, "\n").trim();

const getConstraintViolation = (
  replacement: string,
  constraint: FieldLengthConstraint
) => {
  const wrappedLines = estimateWrappedLineCount(
    replacement,
    constraint.maxCharsPerLine
  );
  const charCount = replacement.length;
  if (
    charCount <= constraint.maxCharsTotal &&
    wrappedLines <= constraint.maxLines
  ) {
    return null;
  }
  return {
    wrappedLines,
    charCount,
  };
};

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const parsed = requestSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload." },
        { status: 400 }
      );
    }

    const { text, instruction, context, lengthConstraint } = parsed.data;
    const system = await getPrompt();
    const cleanText = sanitize(text);
    const cleanInstruction = sanitize(instruction);
    const contextText = context ? JSON.stringify(context, null, 2) : "";
    const constraintText = lengthConstraint
      ? `Length constraint:\n${JSON.stringify(lengthConstraint, null, 2)}`
      : "Length constraint: none.";
    const basePrompt = `Instruction:\n${cleanInstruction}\n\nCurrent text:\n${cleanText}\n\nContext:\n${contextText}\n\n${constraintText}`;

    let replacement = "";
    let violationDetails: { wrappedLines: number; charCount: number } | null =
      null;
    let repairGuidance = "";
    let lastCandidate = "";

    for (let attempt = 1; attempt <= MAX_INLINE_ATTEMPTS; attempt += 1) {
      const result = await generateObject({
        model: openai("gpt-5-nano"),
        system,
        prompt: [
          basePrompt,
          lastCandidate
            ? `Previous candidate replacement:\n${lastCandidate}`
            : "",
          repairGuidance,
        ]
          .filter(Boolean)
          .join("\n\n"),
        schema: responseSchema,
      });

      replacement = sanitize(result.object.replacement || "");

      if (!replacement) {
        repairGuidance =
          "Previous output was empty. Return a non-empty replacement that follows all rules.";
        continue;
      }

      if (!lengthConstraint) {
        violationDetails = null;
        break;
      }

      const violation = getConstraintViolation(replacement, lengthConstraint);
      if (!violation) {
        violationDetails = null;
        break;
      }

      violationDetails = violation;
      lastCandidate = replacement;
      repairGuidance = `Your previous replacement exceeded limits: chars ${violation.charCount}/${lengthConstraint.maxCharsTotal}, wrapped lines ${violation.wrappedLines}/${lengthConstraint.maxLines}. Rewrite to fit both limits exactly while keeping original facts.`;
    }

    if (!replacement) {
      return NextResponse.json(
        { error: "AI returned an empty replacement." },
        { status: 500 }
      );
    }

    if (violationDetails) {
      return NextResponse.json(
        {
          error:
            "AI exceeded the selected max-lines limit. Try regenerating or increase the line limit.",
          details: {
            wrappedLines: violationDetails.wrappedLines,
            maxLines: lengthConstraint?.maxLines,
            charCount: violationDetails.charCount,
            maxCharsTotal: lengthConstraint?.maxCharsTotal,
          },
        },
        { status: 422 }
      );
    }

    return NextResponse.json({ replacement });
  } catch (error) {
    console.error("Error rewriting resume text:", error);
    return NextResponse.json(
      { error: "Failed to rewrite the text." },
      { status: 500 }
    );
  }
}
