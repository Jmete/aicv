import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";

export const runtime = "nodejs";

const requestSchema = z.object({
  text: z.string(),
  instruction: z.string().min(1),
  context: z.record(z.string(), z.unknown()).optional(),
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

    const { text, instruction, context } = parsed.data;
    const system = await getPrompt();
    const cleanText = sanitize(text);
    const cleanInstruction = sanitize(instruction);
    const contextText = context ? JSON.stringify(context, null, 2) : "";

    const result = await generateObject({
      model: openai("gpt-5-nano"),
      system,
      prompt: `Instruction:\n${cleanInstruction}\n\nCurrent text:\n${cleanText}\n\nContext:\n${contextText}`,
      schema: responseSchema,
    });

    const replacement = sanitize(result.object.replacement || "");

    if (!replacement) {
      return NextResponse.json(
        { error: "AI returned an empty replacement." },
        { status: 500 }
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
