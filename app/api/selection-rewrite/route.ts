import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { generateObject, jsonSchema } from "ai";
import { AI_MODELS, getOpenAIProviderOptions } from "@/lib/ai-models";
import {
  estimateWrappedLineCount,
  type FieldLengthConstraint,
} from "@/lib/line-constraints";

export const runtime = "nodejs";
const MAX_REWRITE_ATTEMPTS = 3;

const fieldSchema = z.object({
  path: z.string(),
  text: z.string(),
  lengthConstraint: z
    .object({
      maxLines: z.number().int().positive(),
      maxCharsPerLine: z.number().int().positive(),
      maxCharsTotal: z.number().int().positive(),
      availableWidthPx: z.number().positive(),
      fontSizePx: z.number().positive(),
      fontFamily: z.string().min(1),
      safetyBuffer: z.number().positive().max(1),
    })
    .optional(),
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

type RewriteOperation = z.infer<typeof operationSchema>;

type ConstraintViolation = {
  path: string;
  maxLines: number;
  maxCharsPerLine: number;
  maxCharsTotal: number;
  wrappedLines: number;
  charCount: number;
};

const normalizeOperations = (operations: RewriteOperation[]) =>
  operations.map((operation) => ({
    ...operation,
    value: sanitize(operation.value),
  }));

const getLengthConstraintViolations = (
  operations: z.infer<typeof operationSchema>[],
  constraints: Map<string, FieldLengthConstraint>
) => {
  const violations: ConstraintViolation[] = [];
  for (const operation of operations) {
    if (operation.op !== "replace") continue;
    const constraint = constraints.get(operation.path);
    if (!constraint) continue;
    const value = sanitize(operation.value);
    const wrappedLines = estimateWrappedLineCount(
      value,
      constraint.maxCharsPerLine
    );
    if (
      value.length > constraint.maxCharsTotal ||
      wrappedLines > constraint.maxLines
    ) {
      violations.push({
        path: operation.path,
        maxLines: constraint.maxLines,
        maxCharsPerLine: constraint.maxCharsPerLine,
        maxCharsTotal: constraint.maxCharsTotal,
        wrappedLines,
        charCount: value.length,
      });
    }
  }
  return violations;
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

    const { instruction, fields, scope } = parsed.data;
    const system = await getPrompt();
    const constrainedFields = fields
      .filter((field) => Boolean(field.lengthConstraint))
      .map((field) => ({
        path: field.path,
        constraint: field.lengthConstraint,
      }));
    const constraintMessage =
      constrainedFields.length === 0
        ? "Length constraints: none."
        : `Length constraints:\n${JSON.stringify(constrainedFields, null, 2)}\n\nFor every replace operation on a constrained path, strictly satisfy that path's maxLines and maxCharsTotal limits.`;

    const constraintMap = new Map<string, FieldLengthConstraint>();
    for (const field of fields) {
      if (field.lengthConstraint) {
        constraintMap.set(field.path, field.lengthConstraint);
      }
    }

    const basePrompt = `Instruction:\n${sanitize(instruction)}\n\nScope:\n${JSON.stringify(
      scope,
      null,
      2
    )}\n\nSelected fields:\n${JSON.stringify(
      fields.map((field) => ({
        path: field.path,
        text: field.text,
      })),
      null,
      2
    )}\n\n${constraintMessage}`;

    let repairedOperations: RewriteOperation[] | null = null;
    let lastViolations: ConstraintViolation[] = [];
    let draftOperations: RewriteOperation[] | null = null;
    let repairGuidance = "";
    let lastFailure: "schema" | "constraint" | null = null;

    for (let attempt = 1; attempt <= MAX_REWRITE_ATTEMPTS; attempt += 1) {
      const result = await generateObject({
        model: AI_MODELS.selectionRewrite,
        system,
        prompt: [
          basePrompt,
          draftOperations
            ? `Previous draft operations to revise:\n${JSON.stringify(
                { operations: draftOperations },
                null,
                2
              )}`
            : "",
          repairGuidance,
        ]
          .filter(Boolean)
          .join("\n\n"),
        schema: responseJsonSchema,
        providerOptions: getOpenAIProviderOptions("selectionRewrite"),
      });

      const validated = responseValidationSchema.safeParse(result.object);
      if (!validated.success) {
        lastFailure = "schema";
        repairGuidance =
          "Your previous output did not match the required JSON schema. Return only valid operations JSON.";
        draftOperations = null;
        continue;
      }

      const normalizedOperations = normalizeOperations(validated.data.operations);
      const violations =
        constraintMap.size > 0
          ? getLengthConstraintViolations(normalizedOperations, constraintMap)
          : [];

      if (violations.length === 0) {
        repairedOperations = normalizedOperations;
        break;
      }

      draftOperations = normalizedOperations;
      lastViolations = violations;
      lastFailure = "constraint";
      repairGuidance = `Your previous draft violated length constraints on these paths:\n${violations
        .map(
          (violation) =>
            `- ${violation.path}: chars ${violation.charCount}/${violation.maxCharsTotal}; wrapped lines ${violation.wrappedLines}/${violation.maxLines}; maxCharsPerLine=${violation.maxCharsPerLine}`
        )
        .join(
          "\n"
        )}\nReturn a full operations array again. Keep all operations valid, but aggressively shorten only the violating replace values until every limit is satisfied.`;
    }

    if (!repairedOperations) {
      if (lastFailure === "schema") {
        return NextResponse.json(
          { error: "AI returned invalid operations." },
          { status: 500 }
        );
      }
      return NextResponse.json(
        {
          error:
            "AI exceeded the selected max-lines limit. Try regenerating or increase the line limit.",
          details:
            lastViolations.length > 0
              ? lastViolations.map((violation) => ({
                  path: violation.path,
                  maxLines: violation.maxLines,
                  wrappedLines: violation.wrappedLines,
                  maxCharsTotal: violation.maxCharsTotal,
                  charCount: violation.charCount,
                }))
              : undefined,
        },
        { status: 422 }
      );
    }

    return NextResponse.json({ operations: repairedOperations });
  } catch (error) {
    console.error("Error rewriting selection:", error);
    return NextResponse.json(
      { error: "Failed to rewrite selection." },
      { status: 500 }
    );
  }
}
