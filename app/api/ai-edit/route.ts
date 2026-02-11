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
        education: z.boolean().optional(),
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
    education: z
      .array(
        z
          .object({
            degree: z.string().optional(),
            field: z.string().optional(),
            other: z.string().optional(),
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
      path?: string;
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

const isEducationPath = (path: string) =>
  /^education\[\d+\]\.(degree|field|other)$/.test(path);

const isYearsOfExperienceRequirement = (requirement: Requirement) => {
  const samples = [
    requirement.canonical,
    ...requirement.aliases,
    ...requirement.jdEvidence,
  ];
  return samples.some((sample) => YEARS_OF_EXPERIENCE_REGEX.test(sample));
};

const EXPERIENCE_TOKEN_REGEX = /(\d{1,2})\+?\s*(?:years?|yrs?)\b/gi;
const EXPERIENCE_REQUIREMENT_REGEXES = [
  /at\s+least\s+(\d{1,2})\+?\s*(?:years?|yrs?)\b/gi,
  /minimum\s+(\d{1,2})\+?\s*(?:years?|yrs?)\b/gi,
  /(\d{1,2})\+?\s*(?:years?|yrs?)\b/gi,
];
const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
};
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "be",
  "by",
  "for",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
  "within",
]);
const DEGREE_LEVELS = {
  associate: 1,
  bachelor: 2,
  master: 3,
  doctorate: 4,
} as const;

const normalizeMatchText = (value: string) => {
  const normalized = value
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/[/|]/g, " ")
    .replace(/\bmgmt\b/g, "management")
    .replace(/\bmgr\b/g, "manager")
    .replace(/\byrs?\b/g, "years")
    .replace(/\bbachelors?\b/g, "bachelor")
    .replace(/\bmasters?\b/g, "master")
    .replace(/\bph\.?d\.?\b/g, "doctorate")
    .replace(/\bdoctoral\b/g, "doctorate")
    .replace(/\bgenai\b/g, "generative ai")
    .replace(/\s+/g, " ")
    .trim();

  return normalized.replace(/[^a-z0-9+\s]/g, " ").replace(/\s+/g, " ").trim();
};

const normalizeToken = (token: string) => {
  if (token.length > 4 && token.endsWith("ies")) {
    return `${token.slice(0, -3)}y`;
  }
  if (token.length > 3 && token.endsWith("s")) {
    return token.slice(0, -1);
  }
  return token;
};

const tokenizeForMatch = (value: string) =>
  normalizeMatchText(value)
    .split(" ")
    .map(normalizeToken)
    .filter((token) => token && !STOP_WORDS.has(token));

const toNumericWords = (text: string) =>
  text.replace(
    /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/gi,
    (match) => String(NUMBER_WORDS[match.toLowerCase()] ?? match)
  );

const extractMinimumYears = (text: string) => {
  const normalized = toNumericWords(text.toLowerCase());
  let requiredYears: number | null = null;
  for (const regex of EXPERIENCE_REQUIREMENT_REGEXES) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(normalized)) !== null) {
      const years = Number.parseInt(match[1], 10);
      if (!Number.isFinite(years)) continue;
      requiredYears = requiredYears === null ? years : Math.max(requiredYears, years);
    }
  }
  return requiredYears;
};

const extractMentionedYears = (text: string) => {
  EXPERIENCE_TOKEN_REGEX.lastIndex = 0;
  let maxYears: number | null = null;
  let match: RegExpExecArray | null;
  while ((match = EXPERIENCE_TOKEN_REGEX.exec(text)) !== null) {
    const years = Number.parseInt(match[1], 10);
    if (!Number.isFinite(years)) continue;
    maxYears = maxYears === null ? years : Math.max(maxYears, years);
  }
  return maxYears;
};

const getDegreeLevel = (text: string) => {
  const normalized = normalizeMatchText(text);
  if (!normalized) return null;
  if (/\b(phd|doctorate)\b/.test(normalized)) return DEGREE_LEVELS.doctorate;
  if (/\bmaster\b/.test(normalized)) return DEGREE_LEVELS.master;
  if (/\bbachelor\b/.test(normalized)) return DEGREE_LEVELS.bachelor;
  if (/\bassociate\b/.test(normalized)) return DEGREE_LEVELS.associate;
  if (/\bdegree\b/.test(normalized)) return 0;
  return null;
};

const isPhraseExplicitlyMentioned = (phrase: string, text: string) => {
  const normalizedPhrase = normalizeMatchText(phrase);
  const normalizedText = normalizeMatchText(text);
  if (!normalizedPhrase || !normalizedText) return false;
  if (normalizedText.includes(normalizedPhrase)) return true;

  const phraseTokens = tokenizeForMatch(normalizedPhrase);
  if (phraseTokens.length === 0) return false;
  const textTokens = new Set(tokenizeForMatch(normalizedText));
  return phraseTokens.every((token) => textTokens.has(token));
};

const findDeterministicExplicitMention = (
  requirement: Requirement,
  candidates: CandidateElement[]
) => {
  const requirementTexts = [
    requirement.canonical,
    ...requirement.aliases,
    ...requirement.jdEvidence,
  ]
    .map(sanitize)
    .filter(Boolean);

  if (isYearsOfExperienceRequirement(requirement)) {
    const requiredYears = requirementTexts.reduce<number | null>((best, text) => {
      const value = extractMinimumYears(text);
      if (value === null) return best;
      return best === null ? value : Math.max(best, value);
    }, null);

    if (requiredYears !== null) {
      for (const candidate of candidates) {
        const mentionedYears = extractMentionedYears(candidate.text);
        if (mentionedYears !== null && mentionedYears >= requiredYears) {
          return candidate.path;
        }
      }
    }
  }

  if (requirement.type === "education") {
    const requiredLevel = requirementTexts.reduce<number | null>((best, text) => {
      const level = getDegreeLevel(text);
      if (level === null) return best;
      return best === null ? level : Math.max(best, level);
    }, null);

    for (const candidate of candidates) {
      if (!isEducationPath(candidate.path) && !isSubtitlePath(candidate.path)) continue;
      const candidateLevel = getDegreeLevel(candidate.text);
      if (candidateLevel === null) continue;
      if (requiredLevel === null || requiredLevel === 0) return candidate.path;
      if (candidateLevel >= requiredLevel) return candidate.path;
    }
  }

  const phrases = Array.from(
    new Set([requirement.canonical, ...requirement.aliases].map(sanitize).filter(Boolean))
  );
  for (const candidate of candidates) {
    for (const phrase of phrases) {
      if (isPhraseExplicitlyMentioned(phrase, candidate.text)) {
        return candidate.path;
      }
    }
  }

  return null;
};

const buildCandidates = (
  resumeData: ResumeDataInput,
  profilesByPath: Map<string, ElementProfile>
): CandidateElement[] => {
  const sectionVisibility = resumeData.sectionVisibility ?? {};
  const showExperience = sectionVisibility.experience !== false;
  const showProjects = sectionVisibility.projects !== false;
  const showEducation = sectionVisibility.education !== false;
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

  if (showEducation) {
    (resumeData.education ?? []).forEach((entry, entryIndex) => {
      pushCandidate(`education[${entryIndex}].degree`, entry.degree ?? "");
      pushCandidate(`education[${entryIndex}].field`, entry.field ?? "");
      pushCandidate(`education[${entryIndex}].other`, entry.other ?? "");
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
      path: selectedCandidate?.path ?? undefined,
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
    const includeEducationCandidates = requirement.type === "education";

    const availableCandidates = allCandidates.filter((candidate) => {
      const count = resolutionCountByPath.get(candidate.path) ?? 0;
      if (count >= MAX_RESOLUTIONS_PER_ELEMENT) return false;
      if (isExperienceBulletPath(candidate.path)) return true;
      if (isProjectBulletPath(candidate.path)) return true;
      if (isSubtitlePath(candidate.path)) return true;
      if (isSkillPath(candidate.path)) return true;
      if (isEducationPath(candidate.path)) return includeEducationCandidates;
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

    const deterministicPath = findDeterministicExplicitMention(
      requirement,
      availableCandidates
    );
    if (deterministicPath) {
      resolutionCountByPath.set(
        deterministicPath,
        (resolutionCountByPath.get(deterministicPath) ?? 0) + 1
      );
      await appendReport({
        requirementId: requirement.id,
        canonical: requirement.canonical,
        status: lockedNoEdit ? "locked_no_edit" : "already_mentioned",
        mentioned: "yes",
        matchedPath: deterministicPath,
        reason: "Explicit resume evidence found.",
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
      matchedPath: outcome.kind === "unresolved" ? outcome.path : undefined,
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
