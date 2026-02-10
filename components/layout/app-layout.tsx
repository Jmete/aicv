"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { DEFAULT_RESUME_DATA } from "@/lib/resume-defaults";
import {
  buildResumeDataFromImport,
  setResumeValueAtPath,
} from "@/lib/resume-analysis";
import {
  getSelectedResumeData,
  normalizeResumeProfilesData,
} from "@/lib/resume-profiles";
import { createId } from "@/lib/id";
import type {
  FieldFeedback,
  ResumeAnalysisState,
  ResumeData,
  ResumeProfilesData,
} from "@/types";

export interface ApplicationFormData {
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

const initialFormData: ApplicationFormData = {
  jobUrl: "",
  jobDescription: "",
};

const normalizeComparable = (value: string) =>
  value.replace(/\s+/g, " ").trim();

const hasText = (value: string | undefined | null) =>
  typeof value === "string" && normalizeComparable(value).length > 0;

const clampWeight = (value: number) =>
  Math.max(0, Math.min(100, Math.round(value)));

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

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
    experience: ensureUniqueIds(data.experience),
    projects: ensureUniqueIds(data.projects),
    education: ensureUniqueIds(data.education),
    skills: ensureUniqueIds(data.skills),
  };
};

export function AppLayout() {
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
  const diffToolbarActionsRef = useRef<{
    exportPdf: () => void;
    togglePrintPreview: () => void;
    toggleDebug: () => void;
  } | null>(null);
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
    setPageCounts({
      resumePages: 0,
      coverLetterPages: 0,
      isPrintPreviewMode: false,
    });
  }, [defaultResumeData]);

  const handleResumeUpdate = useCallback((data: ResumeData) => {
    setResumeData(withResumeIntegrityGuardrails(data));
  }, []);

  const handleFormDataChange = useCallback(
    (data: ApplicationFormData) => {
      if (
        normalizeComparable(data.jobDescription) !==
        normalizeComparable(formData.jobDescription)
      ) {
        setExtractedRequirementsPayload(null);
        setRequirementsDebugPayload(null);
      }
      setFormData(data);
      setExtractError(null);
      setRequirementsError(null);
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
        nextProfileId === resumeProfilesData.selectedProfileId
      ) {
        return;
      }

      const nextProfilesData = normalizeResumeProfilesData({
        ...resumeProfilesData,
        selectedProfileId: nextProfileId,
      });
      const nextBaseResumeData = withResumeIntegrityGuardrails(
        getSelectedResumeData(nextProfilesData)
      );

      setIsSelectingProfile(true);
      setResumeProfilesData(nextProfilesData);
      setDefaultResumeData(nextBaseResumeData);
      setResumeData(nextBaseResumeData);
      setResumeAnalysis(null);
      setImportError(null);
      setExtractedRequirementsPayload(null);
      setRequirementsDebugPayload(null);
      setRequirementsError(null);
      setIsDiffViewOpen(false);
      setDiffBaseResume(null);

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
    [resumeProfilesData]
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
          setResumeData(selectedResumeData);
          setResumeAnalysis(null);
          setImportError(null);
        }
      } catch (error) {
        console.error("Error loading default resume data:", error);
      }
    }

    loadDefaultResumeData();

    return () => {
      isActive = false;
    };
  }, []);

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

    try {
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
      setRequirementsDebugPayload(payload);
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
  }, [formData.jobDescription]);

  const handleImportResume = useCallback(async (file: File) => {
    setIsImportingResume(true);
    setImportError(null);
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
    setIsDiffViewOpen(false);
    setDiffBaseResume(null);
    setActiveDocumentTab("resume");
    diffToolbarActionsRef.current = null;
    setDiffToolbarState({
      isPrintPreviewMode: true,
      isDebugOpen: false,
      isExportingPdf: false,
    });
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
  const extractedRequirements = extractedRequirementsPayload?.requirements ?? [];
  const extractedRoleTitle = extractedRequirementsPayload?.roleTitle ?? "";
  const extractedRoleFamily = extractedRequirementsPayload?.roleFamily ?? null;

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
                  isDiffViewOpen={showDiffView}
                  onToggleDiffView={handleToggleDiffView}
                  onResetResume={handleResetResume}
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
                resumeData={resumeData}
                onResumeUpdate={handleResumeUpdate}
                analysis={resumeAnalysis}
                onApplySuggestion={handleApplySuggestion}
                maxResumePages={1}
                onPageCountChange={setPageCounts}
                documentTab={activeDocumentTab}
                onDocumentTabChange={setActiveDocumentTab}
                documentTabControl="select"
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
                resumeData={resumeData}
                onResumeUpdate={handleResumeUpdate}
                analysis={resumeAnalysis}
                onApplySuggestion={handleApplySuggestion}
                maxResumePages={1}
                onPageCountChange={setPageCounts}
                documentTab={activeDocumentTab}
                onDocumentTabChange={setActiveDocumentTab}
                documentTabControl="select"
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
                isDiffViewOpen={showDiffView}
                onToggleDiffView={handleToggleDiffView}
                onResetResume={handleResetResume}
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
                    resumeData={resumeData}
                    onResumeUpdate={handleResumeUpdate}
                    analysis={resumeAnalysis}
                    onApplySuggestion={handleApplySuggestion}
                    maxResumePages={1}
                    onPageCountChange={setPageCounts}
                    documentTab={activeDocumentTab}
                    onDocumentTabChange={setActiveDocumentTab}
                    documentTabControl="select"
                  />
                </div>
              </div>
            ) : (
              <ResumeViewer
                resumeData={resumeData}
                onResumeUpdate={handleResumeUpdate}
                analysis={resumeAnalysis}
                onApplySuggestion={handleApplySuggestion}
                maxResumePages={1}
                onPageCountChange={setPageCounts}
                documentTab={activeDocumentTab}
                onDocumentTabChange={setActiveDocumentTab}
                documentTabControl="select"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
