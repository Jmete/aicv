import { openai } from "@ai-sdk/openai";

// Fast model for iterative editing actions in the resume editor.
export const QUICK_EDIT_MODEL_ID = "gpt-5-nano";

// Quick single-field rewrite in the editor.
export const INLINE_REWRITE_MODEL_ID = QUICK_EDIT_MODEL_ID;

// Multi-field rewrite for selected content or full section edits.
export const SELECTION_REWRITE_MODEL_ID = QUICK_EDIT_MODEL_ID;
export const AI_EDIT_MODEL_ID = QUICK_EDIT_MODEL_ID;

// Resume file import + structured extraction.
export const RESUME_IMPORT_MODEL_ID = "gpt-5-nano";
export const REQUIREMENT_EXTRACTION_MODEL_ID = "gpt-5-mini";

export type OpenAIReasoningEffort = "minimal" | "low" | "medium" | "high";
export type OpenAITextVerbosity = "low" | "medium" | "high";

export type AIModelKey =
  | "inlineRewrite"
  | "selectionRewrite"
  | "aiEdit"
  | "resumeImport"
  | "requirementExtraction";

export const MODEL_REASONING_DEFAULTS = {
  quickEdit: "minimal" as OpenAIReasoningEffort,
};

export const AI_MODELS = {
  inlineRewrite: openai(INLINE_REWRITE_MODEL_ID),
  selectionRewrite: openai(SELECTION_REWRITE_MODEL_ID),
  aiEdit: openai(AI_EDIT_MODEL_ID),
  resumeImport: openai(RESUME_IMPORT_MODEL_ID),
  requirementExtraction: openai(REQUIREMENT_EXTRACTION_MODEL_ID),
} as const;

const QUICK_EDIT_MODEL_KEYS = new Set<AIModelKey>([
  "inlineRewrite",
  "selectionRewrite",
  "aiEdit",
]);

export const getOpenAIProviderOptions = (
  modelKey: AIModelKey,
  overrides: {
    reasoningEffort?: OpenAIReasoningEffort;
    textVerbosity?: OpenAITextVerbosity;
  } = {}
) => {
  const defaultReasoningEffort = QUICK_EDIT_MODEL_KEYS.has(modelKey)
    ? MODEL_REASONING_DEFAULTS.quickEdit
    : undefined;
  const reasoningEffort = overrides.reasoningEffort ?? defaultReasoningEffort;
  const textVerbosity = overrides.textVerbosity;

  if (!reasoningEffort && !textVerbosity) return undefined;

  return {
    openai: {
      ...(reasoningEffort ? { reasoningEffort } : {}),
      ...(textVerbosity ? { textVerbosity } : {}),
    },
  };
};
