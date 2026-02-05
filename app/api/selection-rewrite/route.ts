import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { generateObject, jsonSchema } from "ai";
import { openai } from "@ai-sdk/openai";

export const runtime = "nodejs";

const fieldSchema = z.object({
  path: z.string(),
  text: z.string(),
});

const requestSchema = z.object({
  instruction: z.string().min(1),
  fields: z.array(fieldSchema),
  scope: z.object({
    type: z.enum(["selection", "section"]),
    section: z.string().optional(),
  }),
});

const operationSchema = z.object({
  op: z.enum(["replace", "delete", "insert"]),
  path: z.string(),
  value: z.string(),
  index: z.number().int(),
  itemType: z.enum([
    "text",
    "bullet",
    "technology",
    "experience",
    "project",
    "education",
    "skill",
    "none",
  ]),
});

const responseValidationSchema = z.object({
  operations: z.array(operationSchema),
});

const responseJsonSchema = jsonSchema({
  type: "object",
  properties: {
    operations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          op: {
            type: "string",
            enum: ["replace", "delete", "insert"],
          },
          path: {
            type: "string",
          },
          value: {
            type: "string",
          },
          index: {
            type: "integer",
          },
          itemType: {
            type: "string",
            enum: [
              "text",
              "bullet",
              "technology",
              "experience",
              "project",
              "education",
              "skill",
              "none",
            ],
          },
        },
        required: ["op", "path", "value", "index", "itemType"],
        additionalProperties: false,
      },
    },
  },
  required: ["operations"],
  additionalProperties: false,
});

const getPrompt = async () => {
  const filePath = path.join(process.cwd(), "lib", "prompts", "selection-rewrite.md");
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

    const { instruction, fields, scope } = parsed.data;
    const system = await getPrompt();

    const result = await generateObject({
      model: openai("gpt-5-nano"),
      system,
      prompt: `Instruction:\n${sanitize(instruction)}\n\nScope:\n${JSON.stringify(
        scope,
        null,
        2
      )}\n\nSelected fields:\n${JSON.stringify(fields, null, 2)}`,
      schema: responseJsonSchema,
    });

    const validated = responseValidationSchema.safeParse(result.object);
    if (!validated.success) {
      return NextResponse.json(
        { error: "AI returned invalid operations." },
        { status: 500 }
      );
    }

    return NextResponse.json({ operations: validated.data.operations });
  } catch (error) {
    console.error("Error rewriting selection:", error);
    return NextResponse.json(
      { error: "Failed to rewrite selection." },
      { status: 500 }
    );
  }
}
