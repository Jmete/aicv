"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Sidebar } from "./sidebar";
import { JobInputPanel } from "@/components/panels/job-input-panel";
import { ResumeViewer } from "@/components/panels/resume-viewer";
import { ResumeEditorPanel } from "@/components/resume-editor";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  FileDown,
  Loader2,
} from "lucide-react";
import { DEFAULT_RESUME_DATA, PAPER_DIMENSIONS } from "@/lib/resume-defaults";
import {
  buildResumeDataFromImport,
  parseFieldPath,
  setResumeValueAtPath,
} from "@/lib/resume-analysis";
import {
  applySelectedProfileResumeUpdate,
  getSelectedResumeData,
  normalizeResumeProfilesData,
} from "@/lib/resume-profiles";
import {
  buildElementLengthProfile,
  buildFieldLengthConstraint,
  estimateWrappedLineCount,
  getFontSafetyBuffer,
  type ElementLengthProfile,
} from "@/lib/line-constraints";
import { createId } from "@/lib/id";
import type {
  FieldFeedback,
  ResumeAnalysisState,
  ResumeData,
  ResumeProfilesData,
  TextHyperlink,
} from "@/types";

export interface ApplicationFormData {
  variationTitle: string;
  jobUrl: string;
  jobDescription: string;
}

export type RequirementType =
  | "tool"
  | "platform"
  | "method"
  | "responsibility"
  | "domain"
  | "governance"
  | "leadership"
  | "commercial"
  | "education"
  | "constraint";

export type RoleFamily =
  | "data_science"
  | "mlops"
  | "data_engineering"
  | "product"
  | "audit"
  | "consulting"
  | "governance"
  | "other";

export interface ExtractedRequirement {
  id: string;
  canonical: string;
  type: RequirementType;
  weight: number;
  mustHave: boolean;
  aliases: string[];
  jdEvidence: string[];
}

export interface ExtractedRequirementsPayload {
  roleTitle: string;
  roleFamily: RoleFamily;
  requirements: ExtractedRequirement[];
}

interface AiEditOperation {
  op: "replace";
  path: string;
  value: string;
  index: number;
  itemType: "text" | "bullet";
  requirementId: string;
  mentioned: "yes" | "implied" | "none";
  feasibleEdit: boolean;
  edited: boolean;
}

interface AiEditResponse {
  operations?: AiEditOperation[];
  report?: Array<{
    requirementId: string;
    canonical: string;
    status: "already_mentioned" | "edited" | "unresolved" | "locked_no_edit";
    mentioned: "yes" | "implied" | "none";
    matchedPath?: string;
    editedPath?: string;
    reason?: string;
  }>;
  coverLetter?: {
    date?: string;
    hiringManager?: string;
    companyAddress?: string;
    body?: string;
    reason?: string;
  };
  error?: string;
  details?: string;
}

type AiRunMode = "requirements" | "e2e";

interface AiEditProgressState {
  completed: number;
  total: number;
}

export interface RequirementResolutionState {
  requirementId: string;
  mentioned: "yes" | "implied" | "none";
  status: "already_mentioned" | "edited" | "unresolved" | "locked_no_edit";
  resolvedPath: string | null;
  reason?: string;
}

type HoveredRequirementState = {
  path: string | null;
  mentioned: RequirementResolutionState["mentioned"] | null;
};

type ManualSuggestionOperationInput = {
  path: string;
  suggested_edit: string;
  reason?: string;
};

type ManualSuggestionsPayload = {
  operations: ManualSuggestionOperationInput[];
  coverLetter?: {
    hiringManager?: string;
    companyAddress?: string;
    body?: string;
  };
};

interface SavedApplicationRecord {
  id: number;
  companyName: string;
  jobTitle: string;
  variationTitle: string | null;
  jobUrl: string | null;
  jobDescription: string;
  resumeContent: string | null;
  coverLetterContent: string | null;
}

const initialFormData: ApplicationFormData = {
  variationTitle: "",
  jobUrl: "",
  jobDescription: "",
};
const TEMPORARY_AI_EDIT_ERROR =
  "AI provider is temporarily unavailable. Please try AI Edit again.";

const normalizeComparable = (value: string) =>
  value.replace(/\s+/g, " ").trim();

const hasText = (value: string | undefined | null) =>
  typeof value === "string" && normalizeComparable(value).length > 0;

const clampWeight = (value: number) =>
  Math.max(0, Math.min(100, Math.round(value)));

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isStringFieldPath = (data: ResumeData, path: string) => {
  const segments = parseFieldPath(path);
  if (segments.length === 0) return false;

  let cursor: any = data;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const key = segments[index];
    if (cursor == null) return false;
    cursor = cursor[key as keyof typeof cursor];
  }
  if (cursor == null) return false;

  const last = segments[segments.length - 1];
  return typeof cursor[last as keyof typeof cursor] === "string";
};

const REQUIREMENT_TYPES: RequirementType[] = [
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
];

const ROLE_FAMILIES: RoleFamily[] = [
  "data_science",
  "mlops",
  "data_engineering",
  "product",
  "audit",
  "consulting",
  "governance",
  "other",
];

const isRequirementType = (value: unknown): value is RequirementType =>
  typeof value === "string" &&
  REQUIREMENT_TYPES.includes(value as RequirementType);

const isRoleFamily = (value: unknown): value is RoleFamily =>
  typeof value === "string" && ROLE_FAMILIES.includes(value as RoleFamily);

const normalizeStringArray = (
  values: unknown,
  maxItems: number,
  maxLength: number
) => {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const normalized = normalizeComparable(value).slice(0, maxLength);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
    if (output.length >= maxItems) break;
  }
  return output;
};

const normalizeRequirements = (items: unknown[]): ExtractedRequirement[] => {
  const deduped = new Map<string, ExtractedRequirement>();

  for (const item of items) {
    if (!isObject(item)) continue;
    const idValue = item.id;
    const canonicalValue = item.canonical;
    const typeValue = item.type;
    const weightValue = item.weight;
    const mustHaveValue = item.mustHave;

    if (
      typeof idValue !== "string" ||
      typeof canonicalValue !== "string" ||
      typeof weightValue !== "number" ||
      typeof mustHaveValue !== "boolean" ||
      !isRequirementType(typeValue)
    ) {
      continue;
    }

    const id = normalizeComparable(idValue);
    const canonical = normalizeComparable(canonicalValue);
    if (!id || !canonical) continue;

    const next: ExtractedRequirement = {
      id,
      canonical,
      type: typeValue,
      weight: clampWeight(weightValue),
      mustHave: mustHaveValue,
      aliases: normalizeStringArray(item.aliases, 5, 80).filter(
        (value) => value.toLowerCase() !== canonical.toLowerCase()
      ),
      jdEvidence: normalizeStringArray(item.jdEvidence, 3, 180),
    };

    const key = canonical.toLowerCase();
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, next);
      continue;
    }

    deduped.set(key, {
      ...next,
      mustHave: existing.mustHave || next.mustHave,
      aliases: normalizeStringArray(
        [...existing.aliases, ...next.aliases],
        5,
        80
      ).filter((value) => value.toLowerCase() !== canonical.toLowerCase()),
      jdEvidence: normalizeStringArray(
        [...existing.jdEvidence, ...next.jdEvidence],
        3,
        180
      ),
    });
  }

  return Array.from(deduped.values()).sort((a, b) => {
    if (a.mustHave !== b.mustHave) return a.mustHave ? -1 : 1;
    if (b.weight !== a.weight) return b.weight - a.weight;
    return a.canonical.localeCompare(b.canonical);
  });
};

const extractRequirementsPayload = (
  payload: unknown
): ExtractedRequirementsPayload | null => {
  if (!isObject(payload)) return null;
  if (typeof payload.roleTitle !== "string") return null;
  if (!isRoleFamily(payload.roleFamily)) return null;
  if (!Array.isArray(payload.requirements)) return null;

  const requirements = normalizeRequirements(payload.requirements);
  if (!requirements.length) return null;

  return {
    roleTitle: normalizeComparable(payload.roleTitle).slice(0, 160),
    roleFamily: payload.roleFamily,
    requirements,
  };
};

const parseManualSuggestionsPayload = (
  payload: unknown
): ManualSuggestionsPayload | null => {
  if (!isObject(payload)) return null;
  if (!Array.isArray(payload.operations)) return null;

  const operations: ManualSuggestionOperationInput[] = [];
  for (const item of payload.operations) {
    if (!isObject(item)) continue;
    const path =
      typeof item.path === "string" ? item.path.trim() : "";
    const suggestedEdit =
      typeof item.suggested_edit === "string" ? item.suggested_edit : "";
    const reason = typeof item.reason === "string" ? item.reason : undefined;
    if (!path) continue;
    operations.push({ path, suggested_edit: suggestedEdit, reason });
  }

  let coverLetter: ManualSuggestionsPayload["coverLetter"];
  if (isObject(payload.coverLetter)) {
    coverLetter = {
      ...(typeof payload.coverLetter.hiringManager === "string"
        ? { hiringManager: payload.coverLetter.hiringManager }
        : {}),
      ...(typeof payload.coverLetter.companyAddress === "string"
        ? { companyAddress: payload.coverLetter.companyAddress }
        : {}),
      ...(typeof payload.coverLetter.body === "string"
        ? { body: payload.coverLetter.body }
        : {}),
    };
  }

  return {
    operations,
    ...(coverLetter ? { coverLetter } : {}),
  };
};

const parseJsonPayload = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const isCoverLetterData = (
  value: unknown
): value is ResumeData["coverLetter"] => {
  if (!isObject(value)) return false;
  return (
    typeof value.date === "string" &&
    typeof value.hiringManager === "string" &&
    typeof value.companyAddress === "string" &&
    typeof value.body === "string" &&
    typeof value.sendoff === "string"
  );
};

const isResumeDataPayload = (value: unknown): value is ResumeData => {
  if (!isObject(value)) return false;
  return (
    isObject(value.pageSettings) &&
    isObject(value.metadata) &&
    isObject(value.sectionVisibility) &&
    isObject(value.layoutPreferences) &&
    isObject(value.coverLetter) &&
    Array.isArray(value.experience) &&
    Array.isArray(value.projects) &&
    Array.isArray(value.education) &&
    Array.isArray(value.skills)
  );
};

const ensureUniqueIds = <T extends { id: string }>(items: T[]): T[] => {
  const seen = new Set<string>();
  return items.map((item) => {
    let id = hasText(item.id) ? item.id : createId();
    while (seen.has(id)) id = createId();
    seen.add(id);
    return id === item.id ? item : { ...item, id };
  });
};

const withResumeIntegrityGuardrails = (data: ResumeData): ResumeData => {
  return {
    ...data,
    aboutMe: typeof data.aboutMe === "string" ? data.aboutMe : "",
    experience: ensureUniqueIds(data.experience),
    projects: ensureUniqueIds(data.projects),
    education: ensureUniqueIds(data.education),
    skills: ensureUniqueIds(data.skills),
  };
};

const getRawTextValueAtPath = (data: ResumeData, path: string): string => {
  const segments = parseFieldPath(path);
  let cursor: any = data;
  for (const segment of segments) {
    if (cursor == null) return "";
    cursor = cursor[segment as keyof typeof cursor];
  }
  if (typeof cursor === "string") return cursor;
  if (
    Array.isArray(cursor) &&
    path.endsWith(".technologies") &&
    cursor.every((item) => typeof item === "string")
  ) {
    return cursor.join(", ");
  }
  return "";
};

const isMultilineFieldPath = (path: string) => path === "metadata.summary";

const normalizeFieldText = (value: string, multiline: boolean) => {
  const normalized = value.replace(/\u00a0/g, " ");
  return multiline ? normalized : normalized.replace(/\n+/g, " ");
};

const getRenderedTextValueAtPath = (data: ResumeData, path: string): string =>
  normalizeFieldText(getRawTextValueAtPath(data, path), isMultilineFieldPath(path));

const isHyperlinkRangeValid = (
  value: string,
  hyperlink: Pick<TextHyperlink, "start" | "end" | "text">
) => {
  if (!Number.isInteger(hyperlink.start) || !Number.isInteger(hyperlink.end)) {
    return false;
  }
  if (hyperlink.start < 0 || hyperlink.end <= hyperlink.start) {
    return false;
  }
  if (hyperlink.end > value.length) {
    return false;
  }
  return value.slice(hyperlink.start, hyperlink.end) === hyperlink.text;
};

const findTextChangeRange = (previousText: string, nextText: string) => {
  let start = 0;
  const maxPrefixLength = Math.min(previousText.length, nextText.length);
  while (
    start < maxPrefixLength &&
    previousText[start] === nextText[start]
  ) {
    start += 1;
  }

  let previousEnd = previousText.length;
  let nextEnd = nextText.length;
  while (
    previousEnd > start &&
    nextEnd > start &&
    previousText[previousEnd - 1] === nextText[nextEnd - 1]
  ) {
    previousEnd -= 1;
    nextEnd -= 1;
  }

  return { start, previousEnd, nextEnd };
};

const remapHyperlinkAfterTextChange = (
  hyperlink: TextHyperlink,
  previousText: string,
  nextText: string
): TextHyperlink | null => {
  if (!isHyperlinkRangeValid(previousText, hyperlink)) {
    return null;
  }

  if (
    hyperlink.start === 0 &&
    hyperlink.end === previousText.length &&
    hyperlink.text === previousText
  ) {
    if (!nextText) {
      return null;
    }
    return {
      ...hyperlink,
      start: 0,
      end: nextText.length,
      text: nextText,
    };
  }

  const { start: changeStart, previousEnd, nextEnd } = findTextChangeRange(
    previousText,
    nextText
  );
  const insertedLength = nextEnd - changeStart;
  const removedLength = previousEnd - changeStart;
  const delta = insertedLength - removedLength;

  let nextStart = hyperlink.start;
  let nextHyperlinkEnd = hyperlink.end;

  if (removedLength === 0) {
    if (changeStart < hyperlink.start) {
      nextStart += delta;
      nextHyperlinkEnd += delta;
    } else if (changeStart <= hyperlink.end) {
      nextHyperlinkEnd += delta;
    }
  } else if (previousEnd <= hyperlink.start) {
    nextStart += delta;
    nextHyperlinkEnd += delta;
  } else if (changeStart >= hyperlink.end) {
    // Text changed after the hyperlink range.
  } else if (changeStart <= hyperlink.start && previousEnd >= hyperlink.end) {
    if (insertedLength === 0) {
      return null;
    }
    nextStart = changeStart;
    nextHyperlinkEnd = nextEnd;
  } else if (changeStart <= hyperlink.start) {
    nextStart = changeStart;
    nextHyperlinkEnd = nextEnd + (hyperlink.end - previousEnd);
  } else if (previousEnd >= hyperlink.end) {
    nextHyperlinkEnd = changeStart + insertedLength;
  } else {
    nextHyperlinkEnd += delta;
  }

  nextStart = Math.max(0, Math.min(nextStart, nextText.length));
  nextHyperlinkEnd = Math.max(
    nextStart,
    Math.min(nextHyperlinkEnd, nextText.length)
  );
  if (nextHyperlinkEnd <= nextStart) {
    return null;
  }

  const nextHyperlinkText = nextText.slice(nextStart, nextHyperlinkEnd);
  if (!nextHyperlinkText) {
    return null;
  }

  return {
    ...hyperlink,
    start: nextStart,
    end: nextHyperlinkEnd,
    text: nextHyperlinkText,
  };
};

const reconcileResumeHyperlinks = (
  previousData: ResumeData,
  nextData: ResumeData
): ResumeData => {
  const nextHyperlinks = Array.isArray(nextData.hyperlinks)
    ? nextData.hyperlinks
    : Array.isArray(previousData.hyperlinks)
      ? previousData.hyperlinks
      : [];

  if (nextHyperlinks.length === 0) {
    return nextData;
  }

  const paths = new Set(nextHyperlinks.map((hyperlink) => hyperlink.path));
  let reconciledHyperlinks = nextHyperlinks;

  for (const path of paths) {
    const previousText = getRenderedTextValueAtPath(previousData, path);
    const nextText = getRenderedTextValueAtPath(nextData, path);

    if (previousText === nextText) {
      continue;
    }

    reconciledHyperlinks = reconciledHyperlinks.flatMap((hyperlink) => {
      if (hyperlink.path !== path) {
        return [hyperlink];
      }

      const remapped = remapHyperlinkAfterTextChange(
        hyperlink,
        previousText,
        nextText
      );
      return remapped ? [remapped] : [];
    });
  }

  return {
    ...nextData,
    hyperlinks: reconciledHyperlinks,
  };
};

export function AppLayout() {
  const searchParams = useSearchParams();
  const selectedVariationId = useMemo(() => {
    const rawVariationId = searchParams.get("variationId")?.trim() ?? "";
    return rawVariationId || null;
  }, [searchParams]);
  const selectedApplicationId = useMemo(() => {
    const rawId = searchParams.get("applicationId")?.trim() ?? "";
    if (!rawId) return null;
    const id = Number(rawId);
    if (!Number.isInteger(id) || id < 1) return null;
    return id;
  }, [searchParams]);
  const [formData, setFormData] = useState<ApplicationFormData>(initialFormData);
  const [isExtractingJobDescription, setIsExtractingJobDescription] =
    useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractedRequirementsPayload, setExtractedRequirementsPayload] =
    useState<ExtractedRequirementsPayload | null>(null);
  const [isExtractingRequirements, setIsExtractingRequirements] =
    useState(false);
  const [requirementsError, setRequirementsError] = useState<string | null>(
    null
  );
  const [requirementsDebugPayload, setRequirementsDebugPayload] = useState<
    unknown | null
  >(null);
  const [isAiEditing, setIsAiEditing] = useState(false);
  const [activeAiRunMode, setActiveAiRunMode] = useState<AiRunMode | null>(
    null
  );
  const [aiEditError, setAiEditError] = useState<string | null>(null);
  const [aiEditProgress, setAiEditProgress] = useState<AiEditProgressState>({
    completed: 0,
    total: 0,
  });
  const [requirementResolutionById, setRequirementResolutionById] = useState<
    Record<string, RequirementResolutionState>
  >({});
  const [aiEditedPaths, setAiEditedPaths] = useState<string[]>([]);
  const [hoveredRequirement, setHoveredRequirement] =
    useState<HoveredRequirementState | null>(null);
  const [resumeProfilesData, setResumeProfilesData] =
    useState<ResumeProfilesData>(normalizeResumeProfilesData(DEFAULT_RESUME_DATA));
  const [defaultResumeData, setDefaultResumeData] =
    useState<ResumeData>(DEFAULT_RESUME_DATA);
  const [resumeData, setResumeData] = useState<ResumeData>(DEFAULT_RESUME_DATA);
  const [isSelectingProfile, setIsSelectingProfile] = useState(false);
  const [resumeAnalysis, setResumeAnalysis] =
    useState<ResumeAnalysisState | null>(null);
  const [isImportingResume, setIsImportingResume] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [pageCounts, setPageCounts] = useState({
    resumePages: 0,
    coverLetterPages: 0,
    isPrintPreviewMode: false,
  });
  const [activeDocumentTab, setActiveDocumentTab] = useState<
    "resume" | "cover-letter"
  >("resume");
  const [isDiffViewOpen, setIsDiffViewOpen] = useState(false);
  const [diffBaseResume, setDiffBaseResume] = useState<ResumeData | null>(null);
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);
  const [mobileWorkspaceTab, setMobileWorkspaceTab] = useState<
    "job" | "preview" | "edit"
  >("preview");
  const [mobileDiffSection, setMobileDiffSection] = useState<
    "original" | "updated"
  >("updated");
  const [saveVariationStatus, setSaveVariationStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [saveVariationError, setSaveVariationError] = useState<string | null>(
    null
  );
  const resumeProfilesDataRef = useRef(resumeProfilesData);
  const diffToolbarActionsRef = useRef<{
    exportPdf: () => void;
    togglePrintPreview: () => void;
    toggleDebug: () => void;
  } | null>(null);
  const charMeasureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [diffToolbarState, setDiffToolbarState] = useState({
    isPrintPreviewMode: true,
    isDebugOpen: false,
    isExportingPdf: false,
  });

  const handleNewApplication = useCallback(() => {
    setFormData(initialFormData);
    setIsExtractingJobDescription(false);
    setIsExtractingRequirements(false);
    setExtractError(null);
    setRequirementsError(null);
    setExtractedRequirementsPayload(null);
    setRequirementsDebugPayload(null);
    setIsAiEditing(false);
    setActiveAiRunMode(null);
    setAiEditError(null);
    setAiEditProgress({ completed: 0, total: 0 });
    setRequirementResolutionById({});
    setAiEditedPaths([]);
    setHoveredRequirement(null);
    setResumeData(defaultResumeData);
    setResumeAnalysis(null);
    setImportError(null);
    setIsDiffViewOpen(false);
    setDiffBaseResume(null);
    setActiveDocumentTab("resume");
    diffToolbarActionsRef.current = null;
    setDiffToolbarState({
      isPrintPreviewMode: true,
      isDebugOpen: false,
      isExportingPdf: false,
    });
    setMobileWorkspaceTab("preview");
    setMobileDiffSection("updated");
    setSaveVariationStatus("idle");
    setSaveVariationError(null);
    setPageCounts({
      resumePages: 0,
      coverLetterPages: 0,
      isPrintPreviewMode: false,
    });
  }, [defaultResumeData]);

  useEffect(() => {
    resumeProfilesDataRef.current = resumeProfilesData;
  }, [resumeProfilesData]);

  const handleResumeUpdate = useCallback((data: ResumeData) => {
    setResumeData((current) => {
      const nextResumeData = withResumeIntegrityGuardrails(
        reconcileResumeHyperlinks(current, data)
      );
      const nextProfilesData = applySelectedProfileResumeUpdate(
        resumeProfilesDataRef.current,
        nextResumeData
      );

      resumeProfilesDataRef.current = nextProfilesData;
      setResumeProfilesData(nextProfilesData);

      setDefaultResumeData(nextResumeData);

      return nextResumeData;
    });
    setSaveVariationStatus("idle");
    setSaveVariationError(null);
  }, []);

  const handleFormDataChange = useCallback(
    (data: ApplicationFormData) => {
      if (
        normalizeComparable(data.jobDescription) !==
        normalizeComparable(formData.jobDescription)
      ) {
        setExtractedRequirementsPayload(null);
        setRequirementsDebugPayload(null);
        setRequirementResolutionById({});
        setAiEditedPaths([]);
        setHoveredRequirement(null);
      }
      setFormData(data);
      setExtractError(null);
      setRequirementsError(null);
      setAiEditError(null);
      setSaveVariationStatus("idle");
      setSaveVariationError(null);
    },
    [formData.jobDescription]
  );

  const baseProfileOptions = useMemo(
    () =>
      resumeProfilesData.profiles.map((profile) => ({
        id: profile.id,
        name: profile.name.trim() || "Untitled Profile",
      })),
    [resumeProfilesData.profiles]
  );

  const handleSelectBaseProfile = useCallback(
    async (nextProfileId: string) => {
      if (
        !nextProfileId ||
        nextProfileId === resumeProfilesDataRef.current.selectedProfileId
      ) {
        return;
      }

      if (typeof document !== "undefined") {
        const activeElement = document.activeElement;
        if (activeElement instanceof HTMLElement) {
          activeElement.blur();
          await new Promise<void>((resolve) => {
            window.requestAnimationFrame(() => resolve());
          });
        }
      }

      const nextProfilesData = normalizeResumeProfilesData({
        ...resumeProfilesDataRef.current,
        selectedProfileId: nextProfileId,
      });
      const nextBaseResumeData = withResumeIntegrityGuardrails(
        getSelectedResumeData(nextProfilesData)
      );

      setIsSelectingProfile(true);
      resumeProfilesDataRef.current = nextProfilesData;
      setResumeProfilesData(nextProfilesData);
      setDefaultResumeData(nextBaseResumeData);
      setResumeData(nextBaseResumeData);
      setResumeAnalysis(null);
      setImportError(null);
      setExtractedRequirementsPayload(null);
      setRequirementsDebugPayload(null);
      setRequirementsError(null);
      setAiEditError(null);
      setIsAiEditing(false);
      setActiveAiRunMode(null);
      setAiEditProgress({ completed: 0, total: 0 });
      setRequirementResolutionById({});
      setAiEditedPaths([]);
      setHoveredRequirement(null);
      setIsDiffViewOpen(false);
      setDiffBaseResume(null);
      setSaveVariationStatus("idle");
      setSaveVariationError(null);

      try {
        const response = await fetch("/api/resume-data?mode=profiles", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(nextProfilesData),
        });
        if (!response.ok) {
          throw new Error("Failed to save profile selection");
        }
      } catch (error) {
        console.error("Error saving profile selection:", error);
      } finally {
        setIsSelectingProfile(false);
      }
    },
    []
  );

  useEffect(() => {
    let isActive = true;

    async function loadDefaultResumeData() {
      try {
        const response = await fetch("/api/resume-data?mode=profiles");
        if (!response.ok) return;
        const data = normalizeResumeProfilesData(await response.json());
        const selectedResumeData = withResumeIntegrityGuardrails(
          getSelectedResumeData(data)
        );
        if (isActive) {
          setResumeProfilesData(data);
          setDefaultResumeData(selectedResumeData);
          if (selectedApplicationId == null && selectedVariationId == null) {
            setResumeData(selectedResumeData);
          }
          setResumeAnalysis(null);
          setImportError(null);
          setSaveVariationStatus("idle");
          setSaveVariationError(null);
        }
      } catch (error) {
        console.error("Error loading default resume data:", error);
      }
    }

    loadDefaultResumeData();

    return () => {
      isActive = false;
    };
  }, [selectedApplicationId, selectedVariationId]);

  useEffect(() => {
    if (selectedApplicationId == null && selectedVariationId == null) return;
    let isActive = true;

    async function loadSavedApplication() {
      try {
        const query = selectedVariationId
          ? `variationId=${encodeURIComponent(selectedVariationId)}`
          : `id=${selectedApplicationId}`;
        const response = await fetch(`/api/applications?${query}`);
        if (!response.ok) {
          throw new Error("Failed to load saved variation.");
        }
        const payload = (await response.json()) as SavedApplicationRecord;
        const parsedResume = parseJsonPayload(payload.resumeContent);
        const parsedCoverLetter = parseJsonPayload(payload.coverLetterContent);

        const baseResume = isResumeDataPayload(parsedResume)
          ? withResumeIntegrityGuardrails(parsedResume)
          : withResumeIntegrityGuardrails(defaultResumeData);
        const nextResumeData = isCoverLetterData(parsedCoverLetter)
          ? {
              ...baseResume,
              coverLetter: {
                ...baseResume.coverLetter,
                ...parsedCoverLetter,
              },
            }
          : baseResume;

        if (!isActive) return;
        setFormData({
          variationTitle:
            payload.variationTitle?.trim() ||
            payload.jobTitle?.trim() ||
            "Untitled Variation",
          jobUrl: payload.jobUrl ?? "",
          jobDescription: payload.jobDescription ?? "",
        });
        setIsExtractingJobDescription(false);
        setIsExtractingRequirements(false);
        setExtractError(null);
        setRequirementsError(null);
        setExtractedRequirementsPayload(null);
        setRequirementsDebugPayload(null);
        setIsAiEditing(false);
        setActiveAiRunMode(null);
        setAiEditError(null);
        setAiEditProgress({ completed: 0, total: 0 });
        setRequirementResolutionById({});
        setAiEditedPaths([]);
        setHoveredRequirement(null);
        setResumeData(nextResumeData);
        setResumeAnalysis(null);
        setImportError(null);
        setIsDiffViewOpen(false);
        setDiffBaseResume(null);
        setActiveDocumentTab("resume");
        diffToolbarActionsRef.current = null;
        setDiffToolbarState({
          isPrintPreviewMode: true,
          isDebugOpen: false,
          isExportingPdf: false,
        });
        setMobileDiffSection("updated");
        setSaveVariationStatus("idle");
        setSaveVariationError(null);
      } catch (error) {
        console.error("Error loading saved application:", error);
        if (!isActive) return;
        setAiEditError(
          error instanceof Error
            ? error.message
            : "Failed to load saved variation."
        );
      }
    }

    loadSavedApplication();
    return () => {
      isActive = false;
    };
  }, [defaultResumeData, selectedApplicationId, selectedVariationId]);

  useEffect(() => {
    if (saveVariationStatus !== "saved") return;
    const timeout = window.setTimeout(() => {
      setSaveVariationStatus("idle");
    }, 1800);
    return () => window.clearTimeout(timeout);
  }, [saveVariationStatus]);

  const deriveCompanyNameFromUrl = useCallback((rawUrl: string) => {
    const trimmed = rawUrl.trim();
    if (!trimmed) return "";
    try {
      const parsed = new URL(trimmed);
      const hostname = parsed.hostname.replace(/^www\./i, "");
      if (!hostname) return "";
      const [base] = hostname.split(".");
      if (!base) return hostname;
      return base.charAt(0).toUpperCase() + base.slice(1);
    } catch {
      return "";
    }
  }, []);

  const handleSaveVariation = useCallback(async () => {
    const variationTitle = formData.variationTitle.trim();
    if (!variationTitle) {
      setSaveVariationStatus("error");
      setSaveVariationError("Enter a title before saving this variation.");
      return;
    }

    setSaveVariationStatus("saving");
    setSaveVariationError(null);

    const extractedRoleTitleForSave =
      typeof extractedRequirementsPayload?.roleTitle === "string"
        ? extractedRequirementsPayload.roleTitle.trim()
        : "";
    const fallbackJobTitle =
      extractedRoleTitleForSave ||
      resumeData.metadata.subtitle.trim() ||
      variationTitle;
    const companyName =
      deriveCompanyNameFromUrl(formData.jobUrl) || "Saved Variation";

    try {
      const response = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName,
          jobTitle: fallbackJobTitle,
          variationTitle,
          jobUrl: formData.jobUrl.trim() || null,
          jobDescription: formData.jobDescription.trim(),
          resumeContent: resumeData,
          coverLetterContent: resumeData.coverLetter,
          notes: {
            source: "editor-save-variation",
            savedAt: new Date().toISOString(),
          },
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          typeof payload?.error === "string" && payload.error.trim()
            ? payload.error.trim()
            : "Failed to save variation."
        );
      }

      setSaveVariationStatus("saved");
    } catch (error) {
      setSaveVariationStatus("error");
      setSaveVariationError(
        error instanceof Error ? error.message : "Failed to save variation."
      );
    }
  }, [
    deriveCompanyNameFromUrl,
    extractedRequirementsPayload,
    formData.jobDescription,
    formData.jobUrl,
    formData.variationTitle,
    resumeData,
  ]);

  const handleExtractJobDescription = useCallback(async () => {
    const jobUrl = formData.jobUrl.trim();
    if (!jobUrl) {
      setExtractError("Enter a job URL to extract.");
      return;
    }

    setIsExtractingJobDescription(true);
    setExtractError(null);

    try {
      const response = await fetch("/api/extract-job-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobUrl }),
      });
      const rawText = await response.text();
      let payload: any = {};
      if (rawText) {
        try {
          payload = JSON.parse(rawText);
        } catch {
          throw new Error("Extract failed. Server returned invalid JSON.");
        }
      }
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to extract job description.");
      }
      if (!payload?.jobDescription || typeof payload.jobDescription !== "string") {
        throw new Error("Extraction failed. No job description text was returned.");
      }
      setFormData((current) => ({
        ...current,
        jobDescription: payload.jobDescription,
      }));
      setExtractedRequirementsPayload(null);
      setRequirementsError(null);
      setRequirementsDebugPayload(null);
      setRequirementResolutionById({});
      setAiEditedPaths([]);
      setHoveredRequirement(null);
    } catch (error) {
      console.error("Error extracting job description:", error);
      setExtractError(
        error instanceof Error
          ? error.message
          : "Failed to extract job description."
      );
    } finally {
      setIsExtractingJobDescription(false);
    }
  }, [formData.jobUrl]);

  const parsePxValue = useCallback((rawValue: string): number => {
    if (!rawValue || rawValue === "normal") return 0;
    const parsed = Number.parseFloat(rawValue);
    return Number.isFinite(parsed) ? parsed : 0;
  }, []);

  const getFallbackContentWidthPx = useCallback(() => {
    const pageSettings = resumeData.pageSettings ?? DEFAULT_RESUME_DATA.pageSettings;
    const paperSize = pageSettings.paperSize ?? DEFAULT_RESUME_DATA.pageSettings.paperSize;
    const margins =
      pageSettings.resumeMargins ??
      pageSettings.margins ??
      DEFAULT_RESUME_DATA.pageSettings.resumeMargins;
    const paper = PAPER_DIMENSIONS[paperSize];
    const contentWidthMm = paper.width - margins.left - margins.right;
    const pxPerMm = 72 / 25.4;
    return contentWidthMm * pxPerMm;
  }, [resumeData.pageSettings]);

  const measureCharWidth = useCallback(
    (options: {
      element: HTMLElement;
      text: string;
      fontShorthand: string;
      fontFamily: string;
      fontSizePx: number;
      lineHeightPx: number;
      letterSpacingPx: number;
    }) => {
      const {
        element,
        text,
        fontShorthand,
        fontFamily,
        fontSizePx,
        lineHeightPx,
        letterSpacingPx,
      } = options;
      if (typeof document === "undefined") return 8;
      if (!charMeasureCanvasRef.current) {
        charMeasureCanvasRef.current = document.createElement("canvas");
      }
      const context = charMeasureCanvasRef.current.getContext("2d");
      if (!context) return 8;
      context.font = fontShorthand;
      const sample =
        "the quick brown fox jumps over the lazy dog and ships stable features ";
      const measuredSampleWidth = context.measureText(sample).width / sample.length;

      const normalizedFamily = fontFamily.toLowerCase();
      const heuristicRatio = normalizedFamily.includes("mono")
        ? 0.58
        : normalizedFamily.includes("georgia") ||
            normalizedFamily.includes("times") ||
            normalizedFamily.includes("serif")
          ? 0.5
          : 0.46;
      const heuristicWidth = fontSizePx * heuristicRatio;

      const normalizedText = text.replace(/\s+/g, " ").trim();
      const elementRect = element.getBoundingClientRect();
      const appearsSingleLine = elementRect.height <= lineHeightPx * 1.35;
      const observedWidth =
        appearsSingleLine && normalizedText.length >= 12
          ? (elementRect.width / normalizedText.length) * 1.1
          : Number.POSITIVE_INFINITY;

      const candidateWidths = [measuredSampleWidth, heuristicWidth, observedWidth]
        .filter((value) => Number.isFinite(value) && value > 0);
      const baseWidth =
        candidateWidths.length > 0
          ? Math.min(...candidateWidths)
          : measuredSampleWidth || heuristicWidth || 8;
      return Math.max(2, baseWidth + letterSpacingPx);
    },
    []
  );

  const resolveAvailableWidthPx = useCallback(
    (element: HTMLElement, fallbackWidthPx: number) => {
      const selfWidth = element.getBoundingClientRect().width;
      const parentWidth = element.parentElement?.getBoundingClientRect().width ?? 0;
      const grandParentWidth =
        element.parentElement?.parentElement?.getBoundingClientRect().width ?? 0;
      const candidate = Math.max(selfWidth, parentWidth, grandParentWidth);
      const width = candidate > 0 ? candidate : fallbackWidthPx;
      return Math.max(80, Math.min(width, fallbackWidthPx));
    },
    []
  );

  const collectElementLengthProfiles = useCallback(
    (sourceResumeData: ResumeData = resumeData): ElementLengthProfile[] => {
      if (typeof document === "undefined") return [];

      const elements = Array.from(
        document.querySelectorAll<HTMLElement>("[data-field-path]")
      );
      if (elements.length === 0) return [];

      // Keep the last occurrence of each path so diff views prefer the current (right) pane.
      const elementByPath = new Map<string, HTMLElement>();
      for (const element of elements) {
        const path = element.dataset.fieldPath?.trim();
        if (!path) continue;
        elementByPath.set(path, element);
      }

      const fallbackWidthPx = getFallbackContentWidthPx();
      const profiles: ElementLengthProfile[] = [];

      for (const [path, element] of elementByPath.entries()) {
        const text = getRenderedTextValueAtPath(sourceResumeData, path);
        const computed = window.getComputedStyle(element);
        const fontSizePx = Math.max(8, parsePxValue(computed.fontSize));
        const fontFamily = computed.fontFamily || "serif";
        const fontShorthand =
          computed.font && computed.font !== ""
            ? computed.font
            : `${computed.fontWeight} ${computed.fontSize} ${fontFamily}`;
        const lineHeightPx = parsePxValue(computed.lineHeight) || fontSizePx * 1.25;
        const letterSpacingPx = parsePxValue(computed.letterSpacing);
        const availableWidthPx = resolveAvailableWidthPx(element, fallbackWidthPx);
        const safetyBuffer = getFontSafetyBuffer(fontFamily);
        const charWidthPx = measureCharWidth({
          element,
          text,
          fontShorthand,
          fontFamily,
          fontSizePx,
          lineHeightPx,
          letterSpacingPx,
        });

        const oneLineConstraint = buildFieldLengthConstraint(
          {
            availableWidthPx,
            fontSizePx,
            fontFamily,
            charWidthPx,
            safetyBuffer,
          },
          1
        );
        if (!oneLineConstraint) continue;
        const usedLineCount = Math.max(
          1,
          estimateWrappedLineCount(text, oneLineConstraint.maxCharsPerLine)
        );
        const elementConstraint = buildFieldLengthConstraint(
          {
            availableWidthPx,
            fontSizePx,
            fontFamily,
            charWidthPx,
            safetyBuffer,
          },
          usedLineCount
        );
        if (!elementConstraint) continue;

        profiles.push(buildElementLengthProfile(path, text, elementConstraint));
      }

      return profiles.sort((a, b) => a.path.localeCompare(b.path));
    },
    [
      getFallbackContentWidthPx,
      measureCharWidth,
      parsePxValue,
      resolveAvailableWidthPx,
      resumeData,
    ]
  );

  const handleExtractRequirements = useCallback(async () => {
    const jobDescription = formData.jobDescription.trim();
    if (!normalizeComparable(jobDescription)) {
      setRequirementsError("Paste or extract job description text first.");
      return;
    }

    setIsExtractingRequirements(true);
    setRequirementsError(null);
    setRequirementsDebugPayload(null);
    setExtractedRequirementsPayload(null);
    setAiEditError(null);
    setRequirementResolutionById({});
    setAiEditedPaths([]);
    setHoveredRequirement(null);

    try {
      const elementLengthProfiles = collectElementLengthProfiles();
      const response = await fetch("/api/extract-requirements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription }),
      });
      const rawText = await response.text();
      let payload: any = {};
      if (rawText) {
        try {
          payload = JSON.parse(rawText);
        } catch {
          throw new Error("Requirement extraction failed. Invalid JSON.");
        }
      }
      setRequirementsDebugPayload({
        request: {
          jobDescriptionChars: jobDescription.length,
          elementProfileCount: elementLengthProfiles.length,
        },
        elementLengthProfiles,
        response: payload,
      });
      if (!response.ok) {
        const baseError =
          typeof payload?.error === "string" && payload.error.trim()
            ? payload.error.trim()
            : "Failed to extract requirements.";
        const details =
          typeof payload?.details === "string" && payload.details.trim()
            ? payload.details.trim()
            : "";
        throw new Error(details ? `${baseError} ${details}` : baseError);
      }
      const parsedRequirementsPayload = extractRequirementsPayload(payload);
      if (!parsedRequirementsPayload) {
        throw new Error("Extraction failed. No requirements were returned.");
      }
      setExtractedRequirementsPayload(parsedRequirementsPayload);
    } catch (error) {
      console.error("Error extracting requirements:", error);
      setRequirementsError(
        error instanceof Error ? error.message : "Failed to extract requirements."
      );
    } finally {
      setIsExtractingRequirements(false);
    }
  }, [collectElementLengthProfiles, formData.jobDescription]);

  const runAiEditFlow = useCallback(
    async (mode: AiRunMode) => {
      const requirements = extractedRequirementsPayload?.requirements ?? [];
      if (mode === "requirements" && requirements.length === 0) {
        setAiEditError("Extract requirements before running AI Edit.");
        return;
      }
      if (mode === "e2e" && !normalizeComparable(formData.jobDescription)) {
        setAiEditError("Paste or extract job description text first.");
        return;
      }

      const progressTotal = mode === "requirements" ? requirements.length : 1;
      const baseResumeForRun = mode === "e2e" ? defaultResumeData : resumeData;

      setIsAiEditing(true);
      setActiveAiRunMode(mode);
      setAiEditError(null);
      setAiEditProgress({ completed: 0, total: progressTotal });
      setHoveredRequirement(null);

      try {
        const elementLengthProfiles = collectElementLengthProfiles(baseResumeForRun);
        if (elementLengthProfiles.length === 0) {
          throw new Error("Could not measure resume line constraints.");
        }

        const beforeSnapshot = structuredClone(baseResumeForRun);
        const response = await fetch("/api/ai-edit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode,
            ...(mode === "requirements" ? { requirements } : {}),
            jobDescription: formData.jobDescription,
            resumeData: baseResumeForRun,
            elementProfiles: elementLengthProfiles,
            stream: true,
          }),
        });
        if (!response.ok) {
          const rawText = await response.text();
          let payload: AiEditResponse | null = null;
          try {
            payload = rawText ? (JSON.parse(rawText) as AiEditResponse) : null;
          } catch {
            payload = null;
          }
          const baseError = payload?.error?.trim() || "Failed to generate AI edits.";
          const details = payload?.details?.trim() || "";
          throw new Error(details ? `${baseError} ${details}` : baseError);
        }

        const contentType = response.headers.get("content-type") ?? "";
        let payload: AiEditResponse | null = null;
        if (contentType.includes("text/event-stream")) {
          const reader = response.body?.getReader();
          if (!reader) {
            throw new Error("AI Edit stream is unavailable.");
          }
          const decoder = new TextDecoder();
          let buffer = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            let separatorIndex = buffer.indexOf("\n\n");
            while (separatorIndex >= 0) {
              const block = buffer.slice(0, separatorIndex);
              buffer = buffer.slice(separatorIndex + 2);
              separatorIndex = buffer.indexOf("\n\n");
              if (!block.trim()) continue;

              let event = "message";
              const dataLines: string[] = [];
              const lines = block.split("\n");
              for (const line of lines) {
                if (line.startsWith("event:")) {
                  event = line.slice("event:".length).trim();
                  continue;
                }
                if (line.startsWith("data:")) {
                  dataLines.push(line.slice("data:".length).trim());
                }
              }
              const dataText = dataLines.join("\n");
              if (!dataText) continue;
              let eventPayload: any = null;
              try {
                eventPayload = JSON.parse(dataText);
              } catch {
                continue;
              }

              if (event === "progress") {
                const completed = Number(eventPayload?.completed);
                const total = Number(eventPayload?.total);
                if (
                  Number.isFinite(completed) &&
                  Number.isFinite(total) &&
                  total > 0
                ) {
                  setAiEditProgress({
                    completed: Math.max(0, Math.min(total, completed)),
                    total,
                  });
                }
                continue;
              }

              if (event === "done") {
                payload = eventPayload as AiEditResponse;
                continue;
              }

              if (event === "error") {
                const baseError =
                  typeof eventPayload?.error === "string" &&
                  eventPayload.error.trim()
                    ? eventPayload.error.trim()
                    : "Failed to generate AI edits.";
                const details =
                  typeof eventPayload?.details === "string" &&
                  eventPayload.details.trim()
                    ? eventPayload.details.trim()
                    : "";
                throw new Error(details ? `${baseError} ${details}` : baseError);
              }
            }
          }
        } else {
          const rawText = await response.text();
          try {
            payload = rawText ? (JSON.parse(rawText) as AiEditResponse) : null;
          } catch {
            payload = null;
          }
        }

        const operations = Array.isArray(payload?.operations) ? payload.operations : [];
        const nextCoverLetterDate =
          typeof payload?.coverLetter?.date === "string"
            ? payload.coverLetter.date.trim()
            : "";
        const nextCoverLetterHiringManager =
          typeof payload?.coverLetter?.hiringManager === "string"
            ? payload.coverLetter.hiringManager.trim()
            : "";
        const nextCoverLetterCompanyAddress =
          typeof payload?.coverLetter?.companyAddress === "string"
            ? payload.coverLetter.companyAddress.trim()
            : "";
        const nextCoverLetterBody =
          typeof payload?.coverLetter?.body === "string"
            ? payload.coverLetter.body.trim()
            : "";
        const hasCoverLetterDateUpdate =
          nextCoverLetterDate.length > 0 &&
          normalizeComparable(nextCoverLetterDate) !==
            normalizeComparable(beforeSnapshot.coverLetter.date);
        const hasCoverLetterHiringManagerUpdate =
          nextCoverLetterHiringManager.length > 0 &&
          normalizeComparable(nextCoverLetterHiringManager) !==
            normalizeComparable(beforeSnapshot.coverLetter.hiringManager);
        const hasCoverLetterCompanyAddressUpdate =
          nextCoverLetterCompanyAddress.length > 0 &&
          normalizeComparable(nextCoverLetterCompanyAddress) !==
            normalizeComparable(beforeSnapshot.coverLetter.companyAddress);
        const hasCoverLetterBodyUpdate =
          nextCoverLetterBody.length > 0 &&
          normalizeComparable(nextCoverLetterBody) !==
            normalizeComparable(beforeSnapshot.coverLetter.body);
        const hasCoverLetterUpdate =
          hasCoverLetterDateUpdate ||
          hasCoverLetterHiringManagerUpdate ||
          hasCoverLetterCompanyAddressUpdate ||
          hasCoverLetterBodyUpdate;
        const report = Array.isArray(payload?.report) ? payload.report : [];
        if (mode === "requirements") {
          const nextRequirementResolutionById: Record<
            string,
            RequirementResolutionState
          > = {};
          for (const entry of report) {
            if (!entry?.requirementId) continue;
            nextRequirementResolutionById[entry.requirementId] = {
              requirementId: entry.requirementId,
              mentioned: entry.mentioned,
              status: entry.status,
              resolvedPath: entry.editedPath ?? entry.matchedPath ?? null,
              reason: entry.reason,
            };
          }
          setRequirementResolutionById(nextRequirementResolutionById);
          setAiEditProgress({
            completed:
              report.length > 0
                ? Math.min(requirements.length, report.length)
                : requirements.length,
            total: requirements.length,
          });
        } else {
          setRequirementResolutionById({});
          setAiEditProgress({ completed: progressTotal, total: progressTotal });
        }
        const nextEditedPaths = Array.from(
          new Set(
            operations
              .filter((operation) => operation.op === "replace" && operation.path)
              .map((operation) => operation.path)
          )
        );
        setAiEditedPaths(nextEditedPaths);
        if (operations.length === 0 && !hasCoverLetterUpdate) {
          const payloadError =
            typeof payload?.error === "string" ? payload.error.trim() : "";
          const payloadDetails =
            typeof payload?.details === "string" ? payload.details.trim() : "";
          if (payloadError) {
            setAiEditError(
              payloadDetails ? `${payloadError} ${payloadDetails}` : payloadError
            );
            return;
          }
          const hasTemporaryServiceIssue = report.some((entry) =>
            typeof entry?.reason === "string"
              ? entry.reason.toLowerCase().includes("temporary ai service issue")
              : false
          );
          setAiEditError(
            hasTemporaryServiceIssue
              ? TEMPORARY_AI_EDIT_ERROR
              : mode === "e2e"
                ? "No feasible end-to-end edits were found."
                : "No feasible ATS-safe inline edits were found."
          );
          return;
        }

        const nextResumeDataFromOperations = operations.reduce((current, operation) => {
          if (operation.op !== "replace") return current;
          if (!operation.path || typeof operation.value !== "string") return current;
          return setResumeValueAtPath(current, operation.path, operation.value);
        }, beforeSnapshot);
        const nextResumeData = hasCoverLetterUpdate
          ? {
              ...nextResumeDataFromOperations,
              coverLetter: {
                ...nextResumeDataFromOperations.coverLetter,
                ...(hasCoverLetterDateUpdate ? { date: nextCoverLetterDate } : {}),
                ...(hasCoverLetterHiringManagerUpdate
                  ? { hiringManager: nextCoverLetterHiringManager }
                  : {}),
                ...(hasCoverLetterCompanyAddressUpdate
                  ? { companyAddress: nextCoverLetterCompanyAddress }
                  : {}),
                ...(hasCoverLetterBodyUpdate ? { body: nextCoverLetterBody } : {}),
              },
            }
          : nextResumeDataFromOperations;

        setResumeData(withResumeIntegrityGuardrails(nextResumeData));
        setSaveVariationStatus("idle");
        setSaveVariationError(null);
        setDiffBaseResume(beforeSnapshot);
        setIsDiffViewOpen(true);
        setMobileDiffSection("updated");
        setActiveDocumentTab(
          operations.length > 0 || !hasCoverLetterUpdate ? "resume" : "cover-letter"
        );
      } catch (error) {
        console.error("Error running AI edit:", error);
        setAiEditError(
          error instanceof Error ? error.message : "Failed to run AI edit."
        );
      } finally {
        setIsAiEditing(false);
        setActiveAiRunMode(null);
      }
    },
    [
      collectElementLengthProfiles,
      defaultResumeData,
      extractedRequirementsPayload,
      formData.jobDescription,
      resumeData,
    ]
  );

  const handleAiEdit = useCallback(async () => {
    await runAiEditFlow("requirements");
  }, [runAiEditFlow]);

  const handleAiE2E = useCallback(async () => {
    await runAiEditFlow("e2e");
  }, [runAiEditFlow]);

  const handleApplyManualSuggestions = useCallback(
    (rawSuggestions: string) => {
      setAiEditError(null);
      setRequirementResolutionById({});
      setHoveredRequirement(null);

      const rawInput = rawSuggestions.trim();
      if (!rawInput) {
        setAiEditError("Paste suggestions JSON before applying.");
        return;
      }

      let payload: unknown;
      try {
        payload = JSON.parse(rawInput);
      } catch {
        setAiEditError("Manual suggestions JSON is invalid.");
        return;
      }

      const parsed = parseManualSuggestionsPayload(payload);
      if (!parsed) {
        setAiEditError(
          "JSON must include an `operations` array and optional `coverLetter` object."
        );
        return;
      }

      const beforeSnapshot = structuredClone(resumeData);

      const invalidPaths: string[] = [];
      const operations = parsed.operations
        .filter((operation) => {
          if (!isStringFieldPath(beforeSnapshot, operation.path)) {
            invalidPaths.push(operation.path);
            return false;
          }
          return true;
        })
        .map((operation) => ({
          path: operation.path,
          value: operation.suggested_edit,
        }));

      if (invalidPaths.length > 0) {
        const preview = invalidPaths.slice(0, 3).join(", ");
        setAiEditError(
          `Invalid path${invalidPaths.length > 1 ? "s" : ""}: ${preview}${
            invalidPaths.length > 3 ? "..." : ""
          }`
        );
        return;
      }

      const nextResumeFromOperations = operations.reduce((current, operation) => {
        return setResumeValueAtPath(current, operation.path, operation.value);
      }, beforeSnapshot);

      const nextCoverLetterHiringManager =
        parsed.coverLetter?.hiringManager ??
        nextResumeFromOperations.coverLetter.hiringManager;
      const nextCoverLetterCompanyAddress =
        parsed.coverLetter?.companyAddress ??
        nextResumeFromOperations.coverLetter.companyAddress;
      const nextCoverLetterBody =
        parsed.coverLetter?.body ?? nextResumeFromOperations.coverLetter.body;

      const hasCoverLetterUpdate =
        normalizeComparable(nextCoverLetterHiringManager) !==
          normalizeComparable(beforeSnapshot.coverLetter.hiringManager) ||
        normalizeComparable(nextCoverLetterCompanyAddress) !==
          normalizeComparable(beforeSnapshot.coverLetter.companyAddress) ||
        normalizeComparable(nextCoverLetterBody) !==
          normalizeComparable(beforeSnapshot.coverLetter.body);

      if (operations.length === 0 && !hasCoverLetterUpdate) {
        setAiEditError("No applicable suggestions found in JSON.");
        return;
      }

      const nextResumeData = hasCoverLetterUpdate
        ? {
            ...nextResumeFromOperations,
            coverLetter: {
              ...nextResumeFromOperations.coverLetter,
              hiringManager: nextCoverLetterHiringManager,
              companyAddress: nextCoverLetterCompanyAddress,
              body: nextCoverLetterBody,
            },
          }
        : nextResumeFromOperations;

      setAiEditedPaths(Array.from(new Set(operations.map((operation) => operation.path))));
      setAiEditProgress({ completed: 0, total: 0 });
      setResumeData(withResumeIntegrityGuardrails(nextResumeData));
      setSaveVariationStatus("idle");
      setSaveVariationError(null);
      setDiffBaseResume(beforeSnapshot);
      setIsDiffViewOpen(true);
      setMobileDiffSection("updated");
      setActiveDocumentTab(
        operations.length > 0 || !hasCoverLetterUpdate ? "resume" : "cover-letter"
      );
    },
    [resumeData]
  );

  const handleImportResume = useCallback(async (file: File) => {
    setIsImportingResume(true);
    setImportError(null);
    setAiEditError(null);
    setAiEditProgress({ completed: 0, total: 0 });
    setRequirementResolutionById({});
    setAiEditedPaths([]);
    setHoveredRequirement(null);
    try {
      const payload = new FormData();
      payload.append("file", file);

      const response = await fetch("/api/resume-import", {
        method: "POST",
        body: payload,
      });
      const rawText = await response.text();
      let body: any = {};
      if (rawText) {
        try {
          body = JSON.parse(rawText);
        } catch {
          throw new Error("Import failed. Server returned invalid JSON.");
        }
      }
      if (!response.ok) {
        throw new Error(body?.error || "Import failed.");
      }

      if (body?.mode === "resume-data" && body?.resumeData) {
        const nextResumeData = withResumeIntegrityGuardrails(
          body.resumeData as ResumeData
        );
        setResumeData(nextResumeData);
        setResumeAnalysis(null);
        setIsDiffViewOpen(false);
        setDiffBaseResume(null);
        setSaveVariationStatus("idle");
        setSaveVariationError(null);
        return;
      }

      setResumeData((current) =>
        buildResumeDataFromImport(current, body.resume)
      );
      setResumeAnalysis({
        resume: body.resume,
        fieldFeedback: body.fieldFeedback,
        raw: body.raw ?? body,
      });
      setIsDiffViewOpen(false);
      setDiffBaseResume(null);
      setSaveVariationStatus("idle");
      setSaveVariationError(null);
    } catch (error) {
      console.error("Error importing resume:", error);
      setImportError(
        error instanceof Error ? error.message : "Failed to import resume."
      );
    } finally {
      setIsImportingResume(false);
    }
  }, []);

  const handleApplySuggestion = useCallback(
    (path: string, suggestionId: string, replacement: string) => {
      setResumeData((current) => {
        const categoryMatch = path.match(/^skills\\[(\\d+)\\]\\.category$/);
        if (categoryMatch) {
          const index = Number(categoryMatch[1]);
          const target = current.skills[index];
          if (!target) return current;
          return {
            ...current,
            skills: current.skills.map((skill) =>
              skill.category === target.category
                ? { ...skill, category: replacement }
                : skill
            ),
          };
        }
        return setResumeValueAtPath(current, path, replacement);
      });
      setSaveVariationStatus("idle");
      setSaveVariationError(null);
      setResumeAnalysis((current) => {
        if (!current) return current;
        const nextFeedback: FieldFeedback[] = current.fieldFeedback.map((entry) => {
          if (entry.path !== path) return entry;
          const remaining = entry.improvementSuggestions.filter(
            (suggestion) => suggestion.id !== suggestionId
          );
          if (remaining.length === 0) {
            return { ...entry, quality: "good", improvementSuggestions: [] };
          }
          return { ...entry, improvementSuggestions: remaining };
        });
        return { ...current, fieldFeedback: nextFeedback };
      });
    },
    []
  );

  const handleReadOnlyResumeUpdate = useCallback((_data: ResumeData) => {}, []);

  const handleReadOnlyApplySuggestion = useCallback(
    (_path: string, _suggestionId: string, _replacement: string) => {},
    []
  );

  const handleResetResume = useCallback(() => {
    setResumeData(defaultResumeData);
    setResumeAnalysis(null);
    setAiEditError(null);
    setAiEditProgress({ completed: 0, total: 0 });
    setRequirementResolutionById({});
    setAiEditedPaths([]);
    setHoveredRequirement(null);
    setIsDiffViewOpen(false);
    setDiffBaseResume(null);
    setActiveDocumentTab("resume");
    diffToolbarActionsRef.current = null;
    setDiffToolbarState({
      isPrintPreviewMode: true,
      isDebugOpen: false,
      isExportingPdf: false,
    });
    setSaveVariationStatus("idle");
    setSaveVariationError(null);
  }, [defaultResumeData]);

  const handleToggleDiffView = useCallback(() => {
    setIsDiffViewOpen((current) => {
      if (current) {
        return false;
      }
      setDiffBaseResume(structuredClone(resumeData));
      setMobileDiffSection("updated");
      return true;
    });
  }, [resumeData]);

  const handleDiscardDiff = useCallback(() => {
    setIsDiffViewOpen(false);
    setDiffBaseResume(null);
    diffToolbarActionsRef.current = null;
    setDiffToolbarState({
      isPrintPreviewMode: true,
      isDebugOpen: false,
      isExportingPdf: false,
    });
  }, []);

  const showDiffView = Boolean(isDiffViewOpen && diffBaseResume);
  const extractedRequirements = useMemo(
    () => extractedRequirementsPayload?.requirements ?? [],
    [extractedRequirementsPayload]
  );
  const extractedRoleTitle = extractedRequirementsPayload?.roleTitle ?? "";
  const extractedRoleFamily = extractedRequirementsPayload?.roleFamily ?? null;
  const requirementCoverage = useMemo(
    () => ({
      directlyMentioned: extractedRequirements.filter(
        (requirement) =>
          requirementResolutionById[requirement.id]?.mentioned === "yes"
      ).length,
      total: extractedRequirements.length,
    }),
    [extractedRequirements, requirementResolutionById]
  );
  const highlightedFieldPaths = useMemo(
    () =>
      Array.from(
        new Set(
          [
            ...aiEditedPaths,
            hoveredRequirement?.mentioned === "implied"
              ? null
              : hoveredRequirement?.path ?? null,
          ].filter(
            (value): value is string => Boolean(value && value.trim())
          )
        )
      ),
    [aiEditedPaths, hoveredRequirement]
  );
  const impliedHighlightedFieldPaths = useMemo(
    () =>
      Array.from(
        new Set(
          [hoveredRequirement?.mentioned === "implied" ? hoveredRequirement?.path : null].filter(
            (value): value is string => Boolean(value && value.trim())
          )
        )
      ),
    [hoveredRequirement]
  );

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background pb-20 md:pb-0">
      <Sidebar onNewApplication={handleNewApplication} />

      <div className="flex min-w-0 flex-1 overflow-hidden">
        <div className="hidden min-w-0 flex-1 overflow-hidden md:flex">
          <div
            className={`relative shrink-0 border-r border-border transition-[width] duration-200 ${
              isLeftPanelOpen ? "w-80" : "w-11"
            }`}
          >
            {isLeftPanelOpen ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-2 z-20 h-7 w-7"
                  onClick={() => setIsLeftPanelOpen(false)}
                  aria-label="Collapse job panel"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <JobInputPanel
                  profileOptions={baseProfileOptions}
                  selectedProfileId={resumeProfilesData.selectedProfileId}
                  onSelectProfile={handleSelectBaseProfile}
                  isSelectingProfile={isSelectingProfile}
                  formData={formData}
                  onChange={handleFormDataChange}
                  onExtractJobDescription={handleExtractJobDescription}
                  isExtractingJobDescription={isExtractingJobDescription}
                  extractError={extractError}
                  onExtractRequirements={handleExtractRequirements}
                  isExtractingRequirements={isExtractingRequirements}
                  requirements={extractedRequirements}
                  extractedRoleTitle={extractedRoleTitle}
                  extractedRoleFamily={extractedRoleFamily}
                  requirementsError={requirementsError}
                  requirementsDebugPayload={requirementsDebugPayload}
                  onAiEdit={handleAiEdit}
                  onAiE2E={handleAiE2E}
                  onApplyManualSuggestions={handleApplyManualSuggestions}
                  isAiEditing={isAiEditing}
                  aiRunMode={activeAiRunMode}
                  aiEditError={aiEditError}
                  aiEditProgress={aiEditProgress}
                  requirementResolutionById={requirementResolutionById}
                  requirementCoverage={requirementCoverage}
                  onRequirementHover={(payload) => {
                    if (!payload?.path || !payload.path.trim()) {
                      setHoveredRequirement(null);
                      return;
                    }
                    setHoveredRequirement(payload);
                  }}
                  isDiffViewOpen={showDiffView}
                  onToggleDiffView={handleToggleDiffView}
                  onResetResume={handleResetResume}
                  onSaveVariation={handleSaveVariation}
                  saveVariationStatus={saveVariationStatus}
                  saveVariationError={saveVariationError}
                />
              </>
            ) : (
              <div className="flex h-full items-start justify-center pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setIsLeftPanelOpen(true)}
                  aria-label="Open job panel"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-hidden">
            {showDiffView && diffBaseResume ? (
              <div className="flex h-full flex-col">
                <div className="flex min-h-[52px] flex-wrap items-center gap-2 border-b border-border px-3 py-2 sm:h-[52px] sm:flex-nowrap sm:px-4 sm:py-0">
                  <ToggleGroup
                    type="single"
                    value={activeDocumentTab}
                    onValueChange={(value) => {
                      if (!value) return;
                      setActiveDocumentTab(value as "resume" | "cover-letter");
                    }}
                    className="h-8 rounded-md border border-border/70 bg-muted/30 p-1"
                  >
                    <ToggleGroupItem value="resume" className="h-6 px-3 text-[11px]">
                      Resume
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="cover-letter"
                      className="h-6 px-3 text-[11px]"
                    >
                      Cover Letter
                    </ToggleGroupItem>
                  </ToggleGroup>
                  <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto sm:gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => setIsDiffViewOpen(false)}
                    >
                      Close Diff
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      onClick={handleDiscardDiff}
                    >
                      Discard Snapshot
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1.5 px-2 text-[11px]"
                      onClick={() => diffToolbarActionsRef.current?.exportPdf()}
                      disabled={diffToolbarState.isExportingPdf}
                    >
                      {diffToolbarState.isExportingPdf ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <FileDown className="h-3.5 w-3.5" />
                      )}
                      {diffToolbarState.isExportingPdf
                        ? "Preparing..."
                        : "Export PDF"}
                    </Button>
                    <Button
                      type="button"
                      variant={
                        diffToolbarState.isPrintPreviewMode ? "secondary" : "ghost"
                      }
                      size="sm"
                      className="h-7 gap-1.5 px-2 text-[11px]"
                      onClick={() =>
                        diffToolbarActionsRef.current?.togglePrintPreview()
                      }
                      aria-label={
                        diffToolbarState.isPrintPreviewMode
                          ? "Exit print preview mode"
                          : "Enable print preview mode"
                      }
                      aria-pressed={diffToolbarState.isPrintPreviewMode}
                    >
                      {diffToolbarState.isPrintPreviewMode ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                      {diffToolbarState.isPrintPreviewMode
                        ? "Exit Preview"
                        : "Print Preview"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => diffToolbarActionsRef.current?.toggleDebug()}
                    >
                      {diffToolbarState.isDebugOpen ? "Hide Debug" : "Debug"}
                    </Button>
                  </div>
                </div>
                <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="flex min-h-0 flex-col border-r border-border">
                    <div className="border-b border-border bg-muted/20 px-3 py-2">
                      <p className="text-[11px] font-medium text-foreground">
                        Original Snapshot
                      </p>
                    </div>
                    <div className="min-h-0 flex-1 overflow-hidden">
                      <ResumeViewer
                        key={`diff-original-${resumeProfilesData.selectedProfileId}`}
                        resumeData={diffBaseResume}
                        onResumeUpdate={handleReadOnlyResumeUpdate}
                        analysis={null}
                        onApplySuggestion={handleReadOnlyApplySuggestion}
                        readOnly
                        allowCoverLetterTabInReadOnly
                        autoScaleToFit
                        documentTab={activeDocumentTab}
                        onDocumentTabChange={setActiveDocumentTab}
                        documentTabControl="none"
                        highlightFieldPaths={highlightedFieldPaths}
                        impliedHighlightFieldPaths={impliedHighlightedFieldPaths}
                        highlightTone="before"
                      />
                    </div>
                  </div>
                  <div className="flex min-h-0 flex-col">
                    <div className="border-b border-border bg-muted/20 px-3 py-2">
                      <p className="text-[11px] font-medium text-foreground">
                        Current Resume
                      </p>
                    </div>
                    <div className="min-h-0 flex-1 overflow-hidden">
                      <ResumeViewer
                        key={`diff-current-${resumeProfilesData.selectedProfileId}`}
                        resumeData={resumeData}
                        onResumeUpdate={handleReadOnlyResumeUpdate}
                        analysis={null}
                        onApplySuggestion={handleReadOnlyApplySuggestion}
                        readOnly
                        allowCoverLetterTabInReadOnly
                        autoScaleToFit
                        documentTab={activeDocumentTab}
                        onDocumentTabChange={setActiveDocumentTab}
                        documentTabControl="none"
                        highlightFieldPaths={highlightedFieldPaths}
                        impliedHighlightFieldPaths={impliedHighlightedFieldPaths}
                        highlightTone="after"
                        onToolbarActionsReady={(actions) => {
                          diffToolbarActionsRef.current = actions;
                        }}
                        onToolbarStateChange={setDiffToolbarState}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : diffBaseResume ? (
              <ResumeViewer
                key={`main-diffable-${resumeProfilesData.selectedProfileId}`}
                resumeData={resumeData}
                onResumeUpdate={handleResumeUpdate}
                analysis={resumeAnalysis}
                onApplySuggestion={handleApplySuggestion}
                maxResumePages={1}
                onPageCountChange={setPageCounts}
                documentTab={activeDocumentTab}
                onDocumentTabChange={setActiveDocumentTab}
                documentTabControl="select"
                highlightFieldPaths={highlightedFieldPaths}
                impliedHighlightFieldPaths={impliedHighlightedFieldPaths}
                highlightTone="after"
                toolbarActionsSlot={
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => setIsDiffViewOpen(true)}
                    >
                      Open Diff
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      onClick={handleDiscardDiff}
                    >
                      Discard
                    </Button>
                  </>
                }
              />
            ) : (
              <ResumeViewer
                key={`main-${resumeProfilesData.selectedProfileId}`}
                resumeData={resumeData}
                onResumeUpdate={handleResumeUpdate}
                analysis={resumeAnalysis}
                onApplySuggestion={handleApplySuggestion}
                maxResumePages={1}
                onPageCountChange={setPageCounts}
                documentTab={activeDocumentTab}
                onDocumentTabChange={setActiveDocumentTab}
                documentTabControl="select"
                highlightFieldPaths={highlightedFieldPaths}
                impliedHighlightFieldPaths={impliedHighlightedFieldPaths}
                highlightTone="after"
              />
            )}
          </div>

          <div
            className={`relative shrink-0 border-l border-border transition-[width] duration-200 ${
              isRightPanelOpen ? "w-[460px]" : "w-11"
            }`}
          >
            {isRightPanelOpen ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute left-2 top-2 z-20 h-7 w-7"
                  onClick={() => setIsRightPanelOpen(false)}
                  aria-label="Collapse editor panel"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <ResumeEditorPanel
                  resumeData={resumeData}
                  onResumeUpdate={handleResumeUpdate}
                  onImportResume={handleImportResume}
                  isImportingResume={isImportingResume}
                  importError={importError}
                />
              </>
            ) : (
              <div className="flex h-full items-start justify-center pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setIsRightPanelOpen(true)}
                  aria-label="Open editor panel"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden md:hidden">
          <div className="border-b border-border bg-card/40 p-2">
            <div className="grid grid-cols-3 gap-1 rounded-lg border border-border/70 bg-muted/40 p-1">
              <Button
                type="button"
                size="sm"
                variant={mobileWorkspaceTab === "job" ? "secondary" : "ghost"}
                className="h-8 text-xs text-foreground"
                onClick={() => setMobileWorkspaceTab("job")}
              >
                Job
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mobileWorkspaceTab === "preview" ? "secondary" : "ghost"}
                className="h-8 text-xs text-foreground"
                onClick={() => setMobileWorkspaceTab("preview")}
              >
                Preview
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mobileWorkspaceTab === "edit" ? "secondary" : "ghost"}
                className="h-8 text-xs text-foreground"
                onClick={() => setMobileWorkspaceTab("edit")}
              >
                Edit
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            {mobileWorkspaceTab === "job" ? (
              <JobInputPanel
                profileOptions={baseProfileOptions}
                selectedProfileId={resumeProfilesData.selectedProfileId}
                onSelectProfile={handleSelectBaseProfile}
                isSelectingProfile={isSelectingProfile}
                formData={formData}
                onChange={handleFormDataChange}
                onExtractJobDescription={handleExtractJobDescription}
                isExtractingJobDescription={isExtractingJobDescription}
                extractError={extractError}
                onExtractRequirements={handleExtractRequirements}
                isExtractingRequirements={isExtractingRequirements}
                requirements={extractedRequirements}
                extractedRoleTitle={extractedRoleTitle}
                extractedRoleFamily={extractedRoleFamily}
                requirementsError={requirementsError}
                requirementsDebugPayload={requirementsDebugPayload}
                onAiEdit={handleAiEdit}
                onAiE2E={handleAiE2E}
                onApplyManualSuggestions={handleApplyManualSuggestions}
                isAiEditing={isAiEditing}
                aiRunMode={activeAiRunMode}
                aiEditError={aiEditError}
                aiEditProgress={aiEditProgress}
                requirementResolutionById={requirementResolutionById}
                requirementCoverage={requirementCoverage}
                onRequirementHover={(payload) => {
                  if (!payload?.path || !payload.path.trim()) {
                    setHoveredRequirement(null);
                    return;
                  }
                  setHoveredRequirement(payload);
                }}
                isDiffViewOpen={showDiffView}
                onToggleDiffView={handleToggleDiffView}
                onResetResume={handleResetResume}
                onSaveVariation={handleSaveVariation}
                saveVariationStatus={saveVariationStatus}
                saveVariationError={saveVariationError}
              />
            ) : mobileWorkspaceTab === "edit" ? (
              <ResumeEditorPanel
                resumeData={resumeData}
                onResumeUpdate={handleResumeUpdate}
                onImportResume={handleImportResume}
                isImportingResume={isImportingResume}
                importError={importError}
              />
            ) : showDiffView && diffBaseResume ? (
              <div className="flex h-full flex-col">
                <div className="border-b border-border bg-card/40 px-3 py-2">
                  <p className="text-xs font-medium text-foreground">
                    Resume Diff Review
                  </p>
                  <p className="mt-0.5 text-[10px] text-foreground">
                    Compare original snapshot and current resume.
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-8 text-[11px]"
                      onClick={() => setIsDiffViewOpen(false)}
                    >
                      Close Diff
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-[11px] text-foreground"
                      onClick={handleDiscardDiff}
                    >
                      Discard
                    </Button>
                  </div>
                </div>

                <div className="border-b border-border bg-background p-2">
                  <div className="grid grid-cols-2 gap-1 rounded-lg border border-border/70 bg-muted/30 p-1">
                    <Button
                      type="button"
                      size="sm"
                      variant={mobileDiffSection === "original" ? "secondary" : "ghost"}
                      className="h-8 text-xs text-foreground"
                      onClick={() => setMobileDiffSection("original")}
                    >
                      Original
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={mobileDiffSection === "updated" ? "secondary" : "ghost"}
                      className="h-8 text-xs text-foreground"
                      onClick={() => setMobileDiffSection("updated")}
                    >
                      Updated
                    </Button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-hidden">
                  <ResumeViewer
                    key={`mobile-diff-${mobileDiffSection}-${resumeProfilesData.selectedProfileId}`}
                    resumeData={
                      mobileDiffSection === "original" ? diffBaseResume : resumeData
                    }
                    onResumeUpdate={handleReadOnlyResumeUpdate}
                    analysis={null}
                    onApplySuggestion={handleReadOnlyApplySuggestion}
                    readOnly
                    allowCoverLetterTabInReadOnly
                    autoScaleToFit
                    documentTab={activeDocumentTab}
                    onDocumentTabChange={setActiveDocumentTab}
                    documentTabControl="select"
                    showToolbarActionsInReadOnly
                    highlightFieldPaths={highlightedFieldPaths}
                    impliedHighlightFieldPaths={impliedHighlightedFieldPaths}
                    highlightTone={
                      mobileDiffSection === "original" ? "before" : "after"
                    }
                  />
                </div>
              </div>
            ) : diffBaseResume ? (
              <div className="flex h-full flex-col">
                <div className="border-b border-border bg-card/40 px-3 py-2">
                  <p className="text-xs font-medium text-foreground">Diff snapshot ready</p>
                  <p className="text-[10px] text-foreground">
                    Open diff to compare snapshot vs latest edits.
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-8 flex-1 text-[11px]"
                      onClick={() => setIsDiffViewOpen(true)}
                    >
                      Open Diff
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 flex-1 text-[11px] text-foreground"
                      onClick={handleDiscardDiff}
                    >
                      Discard
                    </Button>
                  </div>
                </div>
                <div className="min-h-0 flex-1">
                  <ResumeViewer
                    key={`mobile-diffable-${resumeProfilesData.selectedProfileId}`}
                    resumeData={resumeData}
                    onResumeUpdate={handleResumeUpdate}
                    analysis={resumeAnalysis}
                    onApplySuggestion={handleApplySuggestion}
                    maxResumePages={1}
                    onPageCountChange={setPageCounts}
                    documentTab={activeDocumentTab}
                    onDocumentTabChange={setActiveDocumentTab}
                    documentTabControl="select"
                    highlightFieldPaths={highlightedFieldPaths}
                    impliedHighlightFieldPaths={impliedHighlightedFieldPaths}
                    highlightTone="after"
                  />
                </div>
              </div>
            ) : (
              <ResumeViewer
                key={`mobile-main-${resumeProfilesData.selectedProfileId}`}
                resumeData={resumeData}
                onResumeUpdate={handleResumeUpdate}
                analysis={resumeAnalysis}
                onApplySuggestion={handleApplySuggestion}
                maxResumePages={1}
                onPageCountChange={setPageCounts}
                documentTab={activeDocumentTab}
                onDocumentTabChange={setActiveDocumentTab}
                documentTabControl="select"
                highlightFieldPaths={highlightedFieldPaths}
                impliedHighlightFieldPaths={impliedHighlightedFieldPaths}
                highlightTone="after"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
