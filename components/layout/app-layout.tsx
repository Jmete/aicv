"use client";

import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "./sidebar";
import { JobInputPanel } from "@/components/panels/job-input-panel";
import { ResumeViewer } from "@/components/panels/resume-viewer";
import { ResumeEditorPanel } from "@/components/resume-editor";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DEFAULT_RESUME_DATA } from "@/lib/resume-defaults";
import {
  buildResumeDataFromImport,
  setResumeValueAtPath,
} from "@/lib/resume-analysis";
import { createId } from "@/lib/id";
import type { FieldFeedback, ResumeAnalysisState, ResumeData } from "@/types";

export interface ApplicationFormData {
  jobUrl: string;
  jobDescription: string;
}

export type AtomicUnitType =
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

export type CoverageStatus = "explicit" | "partial" | "none";
export type Feasibility = "feasible" | "maybe" | "not_feasible";

export interface MatchedResumeRef {
  resumeId: string;
  excerpt: string;
  matchStrength: number;
}

export interface RecommendedTarget {
  resumeId: string;
  recommendations: string[];
}

export interface ExtractedAtomicUnit {
  id: string;
  canonical: string;
  type: AtomicUnitType;
  weight: number;
  mustHave: boolean;
  coverageStatus: CoverageStatus;
  feasibility: Feasibility;
  matchedResumeRefs: MatchedResumeRef[];
  recommendedTargets: RecommendedTarget[];
  gaps: string[];
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

const ATOMIC_UNIT_TYPES: AtomicUnitType[] = [
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

const COVERAGE_STATUSES: CoverageStatus[] = ["explicit", "partial", "none"];
const FEASIBILITY_VALUES: Feasibility[] = ["feasible", "maybe", "not_feasible"];

const isAtomicUnitType = (value: unknown): value is AtomicUnitType =>
  typeof value === "string" &&
  ATOMIC_UNIT_TYPES.includes(value as AtomicUnitType);

const isCoverageStatus = (value: unknown): value is CoverageStatus =>
  typeof value === "string" &&
  COVERAGE_STATUSES.includes(value as CoverageStatus);

const isFeasibility = (value: unknown): value is Feasibility =>
  typeof value === "string" &&
  FEASIBILITY_VALUES.includes(value as Feasibility);

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

const normalizeMatchedResumeRefs = (values: unknown): MatchedResumeRef[] => {
  if (!Array.isArray(values)) return [];
  const deduped = new Map<string, MatchedResumeRef>();
  for (const value of values) {
    if (!isObject(value)) continue;
    const excerptValue = value.excerpt;
    const resumeIdValue = value.resumeId;
    const matchStrengthValue = value.matchStrength;
    if (
      typeof excerptValue !== "string" ||
      typeof resumeIdValue !== "string" ||
      typeof matchStrengthValue !== "number"
    ) {
      continue;
    }
    const excerpt = normalizeComparable(excerptValue).slice(0, 240);
    const resumeId = normalizeComparable(resumeIdValue).slice(0, 80);
    if (!resumeId && !excerpt) continue;
    const normalized = {
      resumeId,
      excerpt,
      matchStrength: Math.max(
        0,
        Math.min(1, Math.round(matchStrengthValue * 1000) / 1000)
      ),
    };
    const key = `${normalized.resumeId.toLowerCase()}|${normalized.excerpt.toLowerCase()}`;
    const existing = deduped.get(key);
    if (!existing || normalized.matchStrength > existing.matchStrength) {
      deduped.set(key, normalized);
    }
  }
  return Array.from(deduped.values())
    .sort((a, b) => b.matchStrength - a.matchStrength)
    .slice(0, 3);
};

const normalizeRecommendedTargets = (
  values: unknown,
  matchedResumeRefs: MatchedResumeRef[],
  canonical: string,
  gaps: string[]
): RecommendedTarget[] => {
  const deduped = new Map<string, RecommendedTarget>();
  if (Array.isArray(values)) {
    for (const value of values) {
      if (!isObject(value)) continue;
      const resumeIdValue = value.resumeId;
      if (typeof resumeIdValue !== "string") continue;
      const resumeId = normalizeComparable(resumeIdValue).slice(0, 80);
      if (!resumeId) continue;
      const recommendations = normalizeStringArray(value.recommendations, 5, 180);
      if (!recommendations.length) continue;
      const existing = deduped.get(resumeId);
      if (!existing) {
        deduped.set(resumeId, { resumeId, recommendations });
        continue;
      }
      deduped.set(resumeId, {
        resumeId,
        recommendations: normalizeStringArray(
          [...existing.recommendations, ...recommendations],
          5,
          180
        ),
      });
    }
  }

  const normalizedTargets = Array.from(deduped.values()).slice(0, 10);
  if (normalizedTargets.length > 0) return normalizedTargets;

  const fallbackRecommendations = normalizeStringArray(
    [
      gaps[0],
      canonical
        ? `Add truthful resume wording that explicitly demonstrates ${canonical}.`
        : "",
    ],
    3,
    180
  );
  if (!fallbackRecommendations.length) return [];

  const fallbackResumeIds = Array.from(
    new Set(
      matchedResumeRefs
        .slice(0, 2)
        .map((ref) => normalizeComparable(ref.resumeId).slice(0, 80))
        .filter((resumeId) => resumeId.length > 0)
    )
  );

  return fallbackResumeIds
    .map((resumeId) => ({
      resumeId,
      recommendations: fallbackRecommendations,
    }));
};

const normalizeAtomicUnits = (items: unknown[]): ExtractedAtomicUnit[] => {
  const deduped = new Map<string, ExtractedAtomicUnit>();
  for (const item of items) {
    if (!isObject(item)) continue;
    const idValue = item.id;
    const canonicalValue = item.canonical;
    const typeValue = item.type;
    const weightValue = item.weight;
    const mustHaveValue = item.mustHave;
    const coverageStatusValue = item.coverageStatus;
    const feasibilityValue = item.feasibility;
    if (
      typeof idValue !== "string" ||
      typeof canonicalValue !== "string" ||
      typeof weightValue !== "number" ||
      typeof mustHaveValue !== "boolean" ||
      !isCoverageStatus(coverageStatusValue) ||
      !isFeasibility(feasibilityValue) ||
      !isAtomicUnitType(typeValue)
    ) {
      continue;
    }
    const id = normalizeComparable(idValue);
    const canonical = normalizeComparable(canonicalValue);
    if (!id || !canonical) continue;
    const matchedResumeRefs = normalizeMatchedResumeRefs(item.matchedResumeRefs);
    const gaps = normalizeStringArray(item.gaps, 10, 160);
    const next = {
      id,
      canonical,
      type: typeValue,
      weight: clampWeight(weightValue),
      mustHave: mustHaveValue,
      coverageStatus: coverageStatusValue,
      feasibility: feasibilityValue,
      matchedResumeRefs,
      recommendedTargets: normalizeRecommendedTargets(
        item.recommendedTargets,
        matchedResumeRefs,
        canonical,
        gaps
      ),
      gaps,
    };
    const key = canonical.toLowerCase();
    const existing = deduped.get(key);
    if (!existing || next.weight > existing.weight) {
      deduped.set(key, next);
    }
  }
  return Array.from(deduped.values()).sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    return a.canonical.localeCompare(b.canonical);
  });
};

const extractAtomicUnitsFromPayload = (payload: unknown) => {
  if (!isObject(payload)) return [];
  if (!Array.isArray(payload.atomicUnits)) return [];
  return normalizeAtomicUnits(payload.atomicUnits);
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
  const [extractedAtomicUnits, setExtractedAtomicUnits] = useState<
    ExtractedAtomicUnit[]
  >([]);
  const [isExtractingRequirements, setIsExtractingRequirements] =
    useState(false);
  const [requirementsError, setRequirementsError] = useState<string | null>(
    null
  );
  const [requirementsDebugPayload, setRequirementsDebugPayload] = useState<
    unknown | null
  >(null);
  const [defaultResumeData, setDefaultResumeData] =
    useState<ResumeData>(DEFAULT_RESUME_DATA);
  const [resumeData, setResumeData] = useState<ResumeData>(DEFAULT_RESUME_DATA);
  const [resumeAnalysis, setResumeAnalysis] =
    useState<ResumeAnalysisState | null>(null);
  const [isImportingResume, setIsImportingResume] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [pageCounts, setPageCounts] = useState({
    resumePages: 0,
    coverLetterPages: 0,
    isPrintPreviewMode: false,
  });
  const [isDiffViewOpen, setIsDiffViewOpen] = useState(false);
  const [diffBaseResume, setDiffBaseResume] = useState<ResumeData | null>(null);
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [mobileWorkspaceTab, setMobileWorkspaceTab] = useState<
    "job" | "preview" | "edit"
  >("preview");
  const [mobileDiffSection, setMobileDiffSection] = useState<
    "original" | "updated"
  >("updated");

  const handleNewApplication = useCallback(() => {
    setFormData(initialFormData);
    setIsExtractingJobDescription(false);
    setIsExtractingRequirements(false);
    setExtractError(null);
    setRequirementsError(null);
    setExtractedAtomicUnits([]);
    setRequirementsDebugPayload(null);
    setResumeData(defaultResumeData);
    setResumeAnalysis(null);
    setImportError(null);
    setIsDiffViewOpen(false);
    setDiffBaseResume(null);
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
        setExtractedAtomicUnits([]);
        setRequirementsDebugPayload(null);
      }
      setFormData(data);
      setExtractError(null);
      setRequirementsError(null);
    },
    [formData.jobDescription]
  );

  useEffect(() => {
    let isActive = true;

    async function loadDefaultResumeData() {
      try {
        const response = await fetch("/api/resume-data");
        if (!response.ok) return;
        const data = await response.json();
        if (isActive) {
          setDefaultResumeData(data);
          setResumeData(data);
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
      setExtractedAtomicUnits([]);
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

    try {
      const response = await fetch("/api/extract-requirements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription, resumeData }),
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
      const parsedAtomicUnits = extractAtomicUnitsFromPayload(payload);
      if (!parsedAtomicUnits.length) {
        throw new Error("Extraction failed. No requirements were returned.");
      }
      setExtractedAtomicUnits(parsedAtomicUnits);
    } catch (error) {
      console.error("Error extracting requirements:", error);
      setRequirementsError(
        error instanceof Error ? error.message : "Failed to extract requirements."
      );
    } finally {
      setIsExtractingRequirements(false);
    }
  }, [formData.jobDescription, resumeData]);

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
        setDefaultResumeData(nextResumeData);
        setResumeAnalysis(null);
        setIsDiffViewOpen(false);
        setDiffBaseResume(null);

        const saveResponse = await fetch("/api/resume-data", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(nextResumeData),
        });
        if (!saveResponse.ok) {
          throw new Error("Config imported, but saving failed.");
        }
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
  }, []);

  const showDiffView = Boolean(isDiffViewOpen && diffBaseResume);

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
                  formData={formData}
                  onChange={handleFormDataChange}
                  onExtractJobDescription={handleExtractJobDescription}
                  isExtractingJobDescription={isExtractingJobDescription}
                  extractError={extractError}
                  onExtractRequirements={handleExtractRequirements}
                  isExtractingRequirements={isExtractingRequirements}
                  atomicUnits={extractedAtomicUnits}
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
                <div className="border-b border-border bg-card/40 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-medium text-foreground">
                        Resume Diff Review
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Original snapshot on the left, current resume on the right.
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
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
                    </div>
                  </div>
                </div>
                <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="flex min-h-0 flex-col border-r border-border">
                    <div className="border-b border-border bg-muted/20 px-3 py-2">
                      <p className="text-[11px] font-medium text-foreground">
                        Original Resume
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
                      />
                    </div>
                  </div>
                  <div className="flex min-h-0 flex-col">
                    <div className="border-b border-border bg-muted/20 px-3 py-2">
                      <p className="text-[11px] font-medium text-foreground">
                        Updated Resume
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
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : diffBaseResume ? (
              <div className="flex h-full flex-col">
                <div className="flex items-center justify-between border-b border-border bg-card/40 px-3 py-2">
                  <div>
                    <p className="text-xs font-medium text-foreground">
                      Diff snapshot ready
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Open diff to compare the snapshot with your latest edits.
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
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
                formData={formData}
                onChange={handleFormDataChange}
                onExtractJobDescription={handleExtractJobDescription}
                isExtractingJobDescription={isExtractingJobDescription}
                extractError={extractError}
                onExtractRequirements={handleExtractRequirements}
                isExtractingRequirements={isExtractingRequirements}
                atomicUnits={extractedAtomicUnits}
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
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
