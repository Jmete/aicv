import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { APICallError, RetryError, generateObject } from "ai";
import { AI_MODELS, getOpenAIProviderOptions } from "@/lib/ai-models";
import { estimateWrappedLineCount } from "@/lib/line-constraints";

export const runtime = "nodejs";

const MAX_REQUIREMENTS = 24;
const MAX_DECISION_ATTEMPTS = 3;
const MAX_RESOLUTIONS_PER_ELEMENT = 2;
const TEMPORARY_AI_SERVICE_ERROR =
  "AI provider is temporarily unavailable. Please try AI Edit again.";
const TEMPORARY_DECISION_REASON =
  "Temporary AI service issue prevented evaluating this requirement.";

const mentionSchema = z.enum(["yes", "implied", "none"]);

const requirementSchema = z.object({
  id: z.string().min(1),
  canonical: z.string().min(1),
  type: z.enum([
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
  ]),
  weight: z.number(),
  mustHave: z.boolean(),
  aliases: z.array(z.string()).default([]),
  jdEvidence: z.array(z.string()).default([]),
});

const elementWordSchema = z.object({
  index: z.number().int().nonnegative(),
  word: z.string(),
  charCount: z.number().int().nonnegative(),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
});

const elementProfileSchema = z.object({
  path: z.string().min(1),
  text: z.string(),
  maxLines: z.number().int().positive(),
  maxCharsPerLine: z.number().int().positive(),
  maxCharsTotal: z.number().int().positive(),
  usedLineCount: z.number().int().nonnegative(),
  remainingLineCount: z.number().int().nonnegative(),
  overflowLineCount: z.number().int().nonnegative(),
  totalCharCount: z.number().int().nonnegative(),
  remainingCharCount: z.number().int(),
  overflowCharCount: z.number().int(),
  words: z.array(elementWordSchema),
});

const resumeDataSchema = z
  .object({
    sectionVisibility: z
      .object({
        experience: z.boolean().optional(),
        projects: z.boolean().optional(),
        skills: z.boolean().optional(),
      })
      .partial()
      .optional(),
    metadata: z
      .object({
        subtitle: z.string().optional(),
      })
      .passthrough(),
    experience: z
      .array(
        z
          .object({
            bullets: z.array(z.string()).optional(),
          })
          .passthrough()
      )
      .optional(),
    projects: z
      .array(
        z
          .object({
            bullets: z.array(z.string()).optional(),
          })
          .passthrough()
      )
      .optional(),
    skills: z
      .array(
        z
          .object({
            name: z.string().optional(),
          })
          .passthrough()
      )
      .optional(),
  })
  .passthrough();

const requestSchema = z.object({
  requirements: z.array(requirementSchema).min(1).max(MAX_REQUIREMENTS),
  resumeData: resumeDataSchema,
  elementProfiles: z.array(elementProfileSchema),
  stream: z.boolean().optional(),
});

const aiDecisionSchema = z.object({
  path: z.string().nullable(),
  mentioned: mentionSchema,
  feasible_edit: z.boolean(),
  edited: z.boolean(),
  suggested_edit: z.string(),
  reason: z.string(),
});

type Requirement = z.infer<typeof requirementSchema>;
type Mention = z.infer<typeof mentionSchema>;
type ElementProfile = z.infer<typeof elementProfileSchema>;
type ResumeDataInput = z.infer<typeof resumeDataSchema>;
type AiDecision = z.infer<typeof aiDecisionSchema>;
type AiEditRequest = z.infer<typeof requestSchema>;

type CandidateElement = {
  path: string;
  text: string;
  maxLines: number;
  maxCharsPerLine: number;
  maxCharsTotal: number;
  totalCharCount: number;
  words: Array<{ word: string; charCount: number }>;
};

type DecisionOutcome =
  | {
      kind: "already";
      path: string;
      mentioned: "yes";
      reason: string;
    }
  | {
      kind: "edit";
      path: string;
      mentioned: Mention;
      replacement: string;
      reason: string;
    }
  | {
      kind: "unresolved";
      mentioned: Mention;
      reason: string;
    };

const YEARS_OF_EXPERIENCE_REGEX =
  /\b(\d+\+?\s*(years?|yrs?)|years?\s+of\s+experience|minimum\s+\d+\s*(years?|yrs?)|at\s+least\s+\d+\s*(years?|yrs?))\b/i;

const getPrompt = async () => {
  const filePath = path.join(process.cwd(), "lib", "prompts", "ai-edit.md");
  return readFile(filePath, "utf8");
};

const sanitize = (value: string) =>
  value.replace(/\u0000/g, "").replace(/\r\n/g, "\n").trim();

const normalizeComparable = (value: string) =>
  value.replace(/\s+/g, " ").trim().toLowerCase();

const hasTransientMessage = (value: string) => {
  const normalized = value.toLowerCase();
  return (
    normalized.includes("bad gateway") ||
    normalized.includes("gateway timeout") ||
    normalized.includes("service unavailable") ||
    normalized.includes("temporarily unavailable") ||
    normalized.includes("timed out")
  );
};

const isTransientAiError = (error: unknown): boolean => {
  if (APICallError.isInstance(error)) {
    if (error.isRetryable) return true;
    if (typeof error.statusCode === "number" && error.statusCode >= 500) {
      return true;
    }
    return hasTransientMessage(error.message);
  }

  if (RetryError.isInstance(error)) {
    if (error.reason === "abort") return false;
    if (error.errors.some((inner) => isTransientAiError(inner))) return true;
    return hasTransientMessage(error.message);
  }

  if (error instanceof Error) {
    return hasTransientMessage(error.message);
  }

  return false;
};

const getClientFacingAiEditError = (error: unknown) =>
  isTransientAiError(error)
    ? TEMPORARY_AI_SERVICE_ERROR
    : "Failed to generate AI edits.";

const isExperienceBulletPath = (path: string) =>
  /^experience\[\d+\]\.bullets\[\d+\]$/.test(path);

const isProjectBulletPath = (path: string) =>
  /^projects\[\d+\]\.bullets\[\d+\]$/.test(path);

const isSubtitlePath = (path: string) => path === "metadata.subtitle";

const isSkillPath = (path: string) => /^skills\[\d+\]\.name$/.test(path);

const isYearsOfExperienceRequirement = (requirement: Requirement) => {
  const samples = [
    requirement.canonical,
    ...requirement.aliases,
    ...requirement.jdEvidence,
  ];
  return samples.some((sample) => YEARS_OF_EXPERIENCE_REGEX.test(sample));
};

const buildCandidates = (
  resumeData: ResumeDataInput,
  profilesByPath: Map<string, ElementProfile>
): CandidateElement[] => {
  const sectionVisibility = resumeData.sectionVisibility ?? {};
  const showExperience = sectionVisibility.experience !== false;
  const showProjects = sectionVisibility.projects !== false;
  const showSkills = sectionVisibility.skills !== false;
  const candidates: CandidateElement[] = [];

  const pushCandidate = (path: string, fallbackText: string) => {
    const profile = profilesByPath.get(path);
    if (!profile) return;
    const text = sanitize(fallbackText);
    candidates.push({
      path,
      text,
      maxLines: profile.maxLines,
      maxCharsPerLine: profile.maxCharsPerLine,
      maxCharsTotal: profile.maxCharsTotal,
      totalCharCount: profile.totalCharCount,
      words: profile.words.map((word) => ({
        word: word.word,
        charCount: word.charCount,
      })),
    });
  };

  if (showExperience) {
    (resumeData.experience ?? []).forEach((entry, entryIndex) => {
      (entry.bullets ?? []).forEach((bullet, bulletIndex) => {
        pushCandidate(
          `experience[${entryIndex}].bullets[${bulletIndex}]`,
          bullet ?? ""
        );
      });
    });
  }

  if (showProjects) {
    (resumeData.projects ?? []).forEach((project, projectIndex) => {
      (project.bullets ?? []).forEach((bullet, bulletIndex) => {
        pushCandidate(`projects[${projectIndex}].bullets[${bulletIndex}]`, bullet ?? "");
      });
    });
  }

  pushCandidate("metadata.subtitle", resumeData.metadata.subtitle ?? "");

  if (showSkills) {
    (resumeData.skills ?? []).forEach((skill, skillIndex) => {
      pushCandidate(`skills[${skillIndex}].name`, skill.name ?? "");
    });
  }

  return candidates;
};

const getConstraintViolation = (
  replacement: string,
  candidate: Pick<CandidateElement, "maxCharsPerLine" | "maxCharsTotal" | "maxLines">
) => {
  const wrappedLines = estimateWrappedLineCount(
    replacement,
    candidate.maxCharsPerLine
  );
  const charCount = replacement.length;
  if (wrappedLines <= candidate.maxLines && charCount <= candidate.maxCharsTotal) {
    return null;
  }
  return { wrappedLines, charCount };
};

const summarizeCandidates = (candidates: CandidateElement[]) =>
  candidates.map((candidate, index) => ({
    order: index + 1,
    path: candidate.path,
    text: candidate.text,
    chars: {
      total: candidate.totalCharCount,
      maxTotal: candidate.maxCharsTotal,
      maxPerLine: candidate.maxCharsPerLine,
    },
    lines: {
      max: candidate.maxLines,
    },
    words: candidate.words,
  }));

const decideRequirement = async (options: {
  requirement: Requirement;
  candidates: CandidateElement[];
  lockedNoEdit: boolean;
  systemPrompt: string;
}): Promise<DecisionOutcome> => {
  const { requirement, candidates, lockedNoEdit, systemPrompt } = options;
  const candidatesByPath = new Map(candidates.map((candidate) => [candidate.path, candidate]));
  const basePrompt = [
    `Requirement:\n${JSON.stringify(requirement, null, 2)}`,
    `lockedNoEdit: ${lockedNoEdit ? "true" : "false"}`,
    `Candidates in required traversal order:\n${JSON.stringify(
      summarizeCandidates(candidates),
      null,
      2
    )}`,
    "Choose the earliest candidate that resolves the requirement under the loop rules.",
    "If no candidate resolves it, return unresolved with path=null and suggested_edit=\"\".",
  ].join("\n\n");

  let repairGuidance = "";
  let lastSuggestedEdit = "";

  for (let attempt = 1; attempt <= MAX_DECISION_ATTEMPTS; attempt += 1) {
    let result: { object: AiDecision };
    try {
      result = await generateObject({
        model: AI_MODELS.aiEdit,
        system: systemPrompt,
        schema: aiDecisionSchema,
        providerOptions: getOpenAIProviderOptions("aiEdit"),
        prompt: [
          basePrompt,
          lastSuggestedEdit
            ? `Previous suggested edit:\n${lastSuggestedEdit}`
            : "",
          repairGuidance,
        ]
          .filter(Boolean)
          .join("\n\n"),
      });
    } catch (error) {
      if (!isTransientAiError(error)) {
        throw error;
      }
      if (attempt < MAX_DECISION_ATTEMPTS) {
        continue;
      }
      return {
        kind: "unresolved",
        mentioned: "none",
        reason: TEMPORARY_DECISION_REASON,
      };
    }

    const decision: AiDecision = {
      ...result.object,
      suggested_edit: sanitize(result.object.suggested_edit ?? ""),
      reason: sanitize(result.object.reason ?? ""),
    };

    const selectedCandidate = decision.path
      ? candidatesByPath.get(decision.path)
      : null;

    if (decision.path && !selectedCandidate) {
      repairGuidance =
        "Selected path is not valid. Choose a path from the provided candidates only.";
      continue;
    }

    if (lockedNoEdit) {
      if (decision.mentioned === "yes" && !selectedCandidate) {
        repairGuidance =
          "If mentioned is yes, provide the matching candidate path.";
        continue;
      }
      if (decision.mentioned === "yes" && selectedCandidate) {
        return {
          kind: "already",
          path: selectedCandidate.path,
          mentioned: "yes",
          reason: decision.reason || "Requirement already explicit.",
        };
      }
      return {
        kind: "unresolved",
        mentioned: "none",
        reason: decision.reason || "Locked requirement cannot be edited.",
      };
    }

    if (decision.mentioned === "yes") {
      if (!selectedCandidate) {
        repairGuidance =
          "If mentioned is yes, path must point to the matching candidate element.";
        continue;
      }
      return {
        kind: "already",
        path: selectedCandidate.path,
        mentioned: "yes",
        reason: decision.reason || "Requirement already explicit.",
      };
    }

    const shouldEdit = decision.edited || decision.feasible_edit;
    if (shouldEdit) {
      if (!selectedCandidate) {
        repairGuidance =
          "For an edit, path is required and must target one provided candidate.";
        continue;
      }
      if (!decision.suggested_edit) {
        repairGuidance = "For an edit, suggested_edit must be a non-empty string.";
        continue;
      }

      const violation = getConstraintViolation(
        decision.suggested_edit,
        selectedCandidate
      );
      if (violation) {
        lastSuggestedEdit = decision.suggested_edit;
        repairGuidance = `Suggested edit exceeded limits for ${selectedCandidate.path}: chars ${violation.charCount}/${selectedCandidate.maxCharsTotal}, wrapped lines ${violation.wrappedLines}/${selectedCandidate.maxLines}. Rewrite to fit exactly.`;
        continue;
      }

      return {
        kind: "edit",
        path: selectedCandidate.path,
        mentioned: decision.mentioned,
        replacement: decision.suggested_edit,
        reason: decision.reason || "Applied ATS-aligned inline rewrite.",
      };
    }

    return {
      kind: "unresolved",
      mentioned: decision.mentioned,
      reason: decision.reason || "No truthful inline edit found.",
    };
  }

  return {
    kind: "unresolved",
    mentioned: "none",
    reason: "Failed to generate a valid constrained decision.",
  };
};

type AiEditOperation = {
  op: "replace";
  path: string;
  value: string;
  index: -1;
  itemType: "text" | "bullet";
  requirementId: string;
  mentioned: Mention;
  feasibleEdit: boolean;
  edited: boolean;
};

type AiEditReportEntry = {
  requirementId: string;
  canonical: string;
  status: "already_mentioned" | "edited" | "unresolved" | "locked_no_edit";
  mentioned: Mention;
  matchedPath?: string;
  editedPath?: string;
  reason?: string;
};

const runAiEdit = async (
  input: Omit<AiEditRequest, "stream"> & {
    onProgress?: (payload: {
      completed: number;
      total: number;
      requirementId: string;
      canonical: string;
      status: AiEditReportEntry["status"];
    }) => void | Promise<void>;
  }
) => {
  const { requirements, resumeData, elementProfiles, onProgress } = input;
  const systemPrompt = await getPrompt();
  const profilesByPath = new Map(
    elementProfiles.map((profile) => [profile.path, profile])
  );
  const allCandidates = buildCandidates(resumeData, profilesByPath);
  const resolutionCountByPath = new Map<string, number>();
  const total = requirements.length;
  let completed = 0;
  let transientDecisionFailures = 0;

  const operations: AiEditOperation[] = [];
  const report: AiEditReportEntry[] = [];

  const appendReport = async (entry: AiEditReportEntry) => {
    report.push(entry);
    completed += 1;
    if (onProgress) {
      await onProgress({
        completed,
        total,
        requirementId: entry.requirementId,
        canonical: entry.canonical,
        status: entry.status,
      });
    }
  };

  for (const requirement of requirements) {
    const lockedNoEdit =
      requirement.type === "education" || isYearsOfExperienceRequirement(requirement);

    const availableCandidates = allCandidates.filter((candidate) => {
      const count = resolutionCountByPath.get(candidate.path) ?? 0;
      if (count >= MAX_RESOLUTIONS_PER_ELEMENT) return false;
      if (isExperienceBulletPath(candidate.path)) return true;
      if (isProjectBulletPath(candidate.path)) return true;
      if (isSubtitlePath(candidate.path)) return true;
      if (isSkillPath(candidate.path)) return true;
      return false;
    });

    if (availableCandidates.length === 0) {
      await appendReport({
        requirementId: requirement.id,
        canonical: requirement.canonical,
        status: lockedNoEdit ? "locked_no_edit" : "unresolved",
        mentioned: "none",
        reason: "No eligible elements available for this requirement.",
      });
      continue;
    }

    let outcome: DecisionOutcome;
    try {
      outcome = await decideRequirement({
        requirement,
        candidates: availableCandidates,
        lockedNoEdit,
        systemPrompt,
      });
    } catch (error) {
      if (!isTransientAiError(error)) {
        throw error;
      }
      transientDecisionFailures += 1;
      await appendReport({
        requirementId: requirement.id,
        canonical: requirement.canonical,
        status: lockedNoEdit ? "locked_no_edit" : "unresolved",
        mentioned: "none",
        reason: TEMPORARY_DECISION_REASON,
      });
      continue;
    }

    if (
      outcome.kind === "unresolved" &&
      outcome.reason === TEMPORARY_DECISION_REASON
    ) {
      transientDecisionFailures += 1;
    }

    if (outcome.kind === "already") {
      resolutionCountByPath.set(
        outcome.path,
        (resolutionCountByPath.get(outcome.path) ?? 0) + 1
      );
      await appendReport({
        requirementId: requirement.id,
        canonical: requirement.canonical,
        status: lockedNoEdit ? "locked_no_edit" : "already_mentioned",
        mentioned: "yes",
        matchedPath: outcome.path,
        reason: outcome.reason,
      });
      continue;
    }

    if (outcome.kind === "edit" && !lockedNoEdit) {
      const candidate = availableCandidates.find(
        (entry) => entry.path === outcome.path
      );
      if (
        candidate &&
        normalizeComparable(candidate.text) !==
          normalizeComparable(outcome.replacement)
      ) {
        const itemType: "text" | "bullet" = outcome.path.includes(".bullets[")
          ? "bullet"
          : "text";
        operations.push({
          op: "replace",
          path: outcome.path,
          value: outcome.replacement,
          index: -1,
          itemType,
          requirementId: requirement.id,
          mentioned: outcome.mentioned,
          feasibleEdit: true,
          edited: true,
        });
        resolutionCountByPath.set(
          outcome.path,
          (resolutionCountByPath.get(outcome.path) ?? 0) + 1
        );
        await appendReport({
          requirementId: requirement.id,
          canonical: requirement.canonical,
          status: "edited",
          mentioned: outcome.mentioned,
          editedPath: outcome.path,
          reason: outcome.reason,
        });
        continue;
      }
    }

    await appendReport({
      requirementId: requirement.id,
      canonical: requirement.canonical,
      status: lockedNoEdit ? "locked_no_edit" : "unresolved",
      mentioned: lockedNoEdit ? "none" : outcome.mentioned,
      reason: outcome.reason || "No feasible inline edit found.",
    });
  }

  return {
    operations,
    report,
    ...(operations.length === 0 && transientDecisionFailures > 0
      ? { error: TEMPORARY_AI_SERVICE_ERROR }
      : {}),
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

    const { stream = false, ...input } = parsed.data;
    if (!stream) {
      const output = await runAiEdit(input);
      return NextResponse.json(output);
    }

    const encoder = new TextEncoder();
    const eventStream = new ReadableStream<Uint8Array>({
      start(controller) {
        const writeEvent = (event: string, payload: unknown) => {
          const chunk = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
          controller.enqueue(encoder.encode(chunk));
        };

        (async () => {
          try {
            const output = await runAiEdit({
              ...input,
              onProgress: async (payload) => {
                writeEvent("progress", payload);
              },
            });
            writeEvent("done", output);
            controller.close();
          } catch (error) {
            const message = getClientFacingAiEditError(error);
            writeEvent("error", { error: message });
            controller.close();
          }
        })();
      },
    });

    return new Response(eventStream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Error generating AI ATS edits:", error);
    return NextResponse.json(
      { error: getClientFacingAiEditError(error) },
      { status: isTransientAiError(error) ? 503 : 500 }
    );
  }
}
