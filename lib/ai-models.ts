import { openai } from "@ai-sdk/openai";

// Fast model for iterative editing actions in the resume editor.
export const QUICK_EDIT_MODEL_ID = "gpt-5-nano";

// Higher-quality model for full resume/job description optimization passes.
export const FULL_JOB_COMPARISON_MODEL_ID = "gpt-5-mini";

// Quick single-field rewrite in the editor.
export const INLINE_REWRITE_MODEL_ID = QUICK_EDIT_MODEL_ID;

// Multi-field rewrite for selected content or full section edits.
export const SELECTION_REWRITE_MODEL_ID = QUICK_EDIT_MODEL_ID;

// Full resume + job description optimization pass.
export const RESUME_ANALYZE_MODEL_ID = FULL_JOB_COMPARISON_MODEL_ID;

// Advanced tune pipeline for resume/job matching.
export const RESUME_TUNE_MODEL_ID = FULL_JOB_COMPARISON_MODEL_ID;

// Resume file import + structured extraction.
export const RESUME_IMPORT_MODEL_ID = "gpt-5-nano";

export const AI_MODELS = {
  inlineRewrite: openai(INLINE_REWRITE_MODEL_ID),
  selectionRewrite: openai(SELECTION_REWRITE_MODEL_ID),
  resumeAnalyze: openai(RESUME_ANALYZE_MODEL_ID),
  resumeTune: openai(RESUME_TUNE_MODEL_ID),
  resumeImport: openai(RESUME_IMPORT_MODEL_ID),
} as const;
