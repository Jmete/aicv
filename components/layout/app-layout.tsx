"use client";

import { useState, useCallback, useEffect } from "react";
import { Sidebar } from "./sidebar";
import { JobInputPanel } from "@/components/panels/job-input-panel";
import { ResumeViewer } from "@/components/panels/resume-viewer";
import { ResumeEditorPanel } from "@/components/resume-editor";
import { DEFAULT_RESUME_DATA } from "@/lib/resume-defaults";
import {
  buildResumeDataFromImport,
  parseFieldPath,
  setResumeValueAtPath,
} from "@/lib/resume-analysis";
import type { FieldFeedback, ResumeAnalysisState, ResumeData } from "@/types";

export interface ApplicationFormData {
  companyName: string;
  jobTitle: string;
  jobUrl: string;
  jobDescription: string;
  maxResumePages: number;
}

const initialFormData: ApplicationFormData = {
  companyName: "",
  jobTitle: "",
  jobUrl: "",
  jobDescription: "",
  maxResumePages: 1,
};

interface AnalyzeMeta {
  jobDescriptionSource: "manual" | "url" | "url+manual";
  scrapeWarning: string | null;
  estimatedResumePages: number;
  estimatedCoverLetterPages: number;
}

type AnalyzeSuggestionStatus = "pending" | "accepted" | "rejected";
type AnalyzeSuggestionOp = "replace" | "insert" | "delete";

export interface AnalyzeSuggestion {
  id: string;
  index: number;
  status: AnalyzeSuggestionStatus;
  op: AnalyzeSuggestionOp;
  path: string;
  label: string;
  beforeText?: string;
  afterText?: string;
  value?: unknown;
  insertIndex?: number;
}

const createId = () =>
  typeof crypto !== "undefined"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

const normalizeComparable = (value: string) =>
  value.replace(/\s+/g, " ").trim();

const buildBulletSuggestions = (
  baseBullets: string[],
  optimizedBullets: string[],
  pathPrefix: string,
  labelPrefix: string,
  push: (
    suggestion: Omit<AnalyzeSuggestion, "id" | "index" | "status">
  ) => void
) => {
  const minLength = Math.min(baseBullets.length, optimizedBullets.length);
  for (let i = 0; i < minLength; i += 1) {
    const from = baseBullets[i] ?? "";
    const to = optimizedBullets[i] ?? "";
    if (normalizeComparable(from) === normalizeComparable(to)) continue;
    push({
      op: "replace",
      path: `${pathPrefix}[${i}]`,
      label: `${labelPrefix} bullet ${i + 1}`,
      beforeText: from,
      afterText: to,
      value: to,
    });
  }

  for (let i = baseBullets.length; i < optimizedBullets.length; i += 1) {
    const nextValue = optimizedBullets[i] ?? "";
    push({
      op: "insert",
      path: pathPrefix,
      label: `${labelPrefix} add bullet`,
      afterText: nextValue,
      value: nextValue,
      insertIndex: i,
    });
  }

  for (let i = baseBullets.length - 1; i >= optimizedBullets.length; i -= 1) {
    const previousValue = baseBullets[i] ?? "";
    push({
      op: "delete",
      path: `${pathPrefix}[${i}]`,
      label: `${labelPrefix} remove bullet ${i + 1}`,
      beforeText: previousValue,
    });
  }
};

const buildAnalyzeSuggestions = (
  baseResume: ResumeData,
  optimizedResume: ResumeData
): AnalyzeSuggestion[] => {
  const suggestions: AnalyzeSuggestion[] = [];
  let indexCounter = 0;

  const pushSuggestion = (
    suggestion: Omit<AnalyzeSuggestion, "id" | "index" | "status">
  ) => {
    suggestions.push({
      id: createId(),
      index: indexCounter,
      status: "pending",
      ...suggestion,
    });
    indexCounter += 1;
  };

  if (
    normalizeComparable(baseResume.metadata.subtitle) !==
    normalizeComparable(optimizedResume.metadata.subtitle)
  ) {
    pushSuggestion({
      op: "replace",
      path: "metadata.subtitle",
      label: "Update subtitle",
      beforeText: baseResume.metadata.subtitle,
      afterText: optimizedResume.metadata.subtitle,
      value: optimizedResume.metadata.subtitle,
    });
  }

  if (
    normalizeComparable(baseResume.metadata.summary) !==
    normalizeComparable(optimizedResume.metadata.summary)
  ) {
    pushSuggestion({
      op: "replace",
      path: "metadata.summary",
      label: "Rewrite summary",
      beforeText: baseResume.metadata.summary,
      afterText: optimizedResume.metadata.summary,
      value: optimizedResume.metadata.summary,
    });
  }

  baseResume.experience.forEach((entry, baseIndex) => {
    const optimizedEntry = optimizedResume.experience.find(
      (item) => item.id === entry.id
    );
    if (!optimizedEntry) return;

    buildBulletSuggestions(
      entry.bullets,
      optimizedEntry.bullets,
      `experience[${baseIndex}].bullets`,
      `Experience (${entry.jobTitle} at ${entry.company})`,
      pushSuggestion
    );
  });

  baseResume.projects.forEach((project, baseIndex) => {
    const optimizedProject = optimizedResume.projects.find(
      (item) => item.id === project.id
    );
    if (!optimizedProject) return;

    if (
      normalizeComparable(project.technologies.join(", ")) !==
      normalizeComparable(optimizedProject.technologies.join(", "))
    ) {
      pushSuggestion({
        op: "replace",
        path: `projects[${baseIndex}].technologies`,
        label: `Update project technologies (${project.name})`,
        beforeText: project.technologies.join(", "),
        afterText: optimizedProject.technologies.join(", "),
        value: optimizedProject.technologies,
      });
    }

    buildBulletSuggestions(
      project.bullets,
      optimizedProject.bullets,
      `projects[${baseIndex}].bullets`,
      `Project (${project.name})`,
      pushSuggestion
    );
  });

  const baseSkillMap = new Map<string, number>();
  baseResume.skills.forEach((skill, index) => {
    const key = normalizeComparable(skill.name).toLowerCase();
    if (!key) return;
    if (!baseSkillMap.has(key)) {
      baseSkillMap.set(key, index);
    }
  });

  const optimizedSkillMap = new Map<string, string>();
  optimizedResume.skills.forEach((skill) => {
    const key = normalizeComparable(skill.name).toLowerCase();
    if (!key || optimizedSkillMap.has(key)) return;
    optimizedSkillMap.set(key, normalizeComparable(skill.name));
  });

  for (let i = baseResume.skills.length - 1; i >= 0; i -= 1) {
    const skill = baseResume.skills[i];
    const key = normalizeComparable(skill.name).toLowerCase();
    if (!key) continue;
    if (optimizedSkillMap.has(key)) continue;
    pushSuggestion({
      op: "delete",
      path: `skills[${i}]`,
      label: "Remove skill",
      beforeText: skill.name,
    });
  }

  for (const [skillKey, skillName] of optimizedSkillMap.entries()) {
    if (baseSkillMap.has(skillKey)) continue;
    pushSuggestion({
      op: "insert",
      path: "skills",
      label: "Add skill",
      afterText: skillName,
      value: {
        id: createId(),
        name: skillName,
        category: "",
      },
    });
  }

  if (
    normalizeComparable(baseResume.coverLetter.body) !==
    normalizeComparable(optimizedResume.coverLetter.body)
  ) {
    pushSuggestion({
      op: "replace",
      path: "coverLetter.body",
      label: "Rewrite cover letter body",
      beforeText: baseResume.coverLetter.body,
      afterText: optimizedResume.coverLetter.body,
      value: optimizedResume.coverLetter.body,
    });
  }

  if (
    normalizeComparable(baseResume.coverLetter.hiringManager) !==
    normalizeComparable(optimizedResume.coverLetter.hiringManager)
  ) {
    pushSuggestion({
      op: "replace",
      path: "coverLetter.hiringManager",
      label: "Update cover letter recipient",
      beforeText: baseResume.coverLetter.hiringManager,
      afterText: optimizedResume.coverLetter.hiringManager,
      value: optimizedResume.coverLetter.hiringManager,
    });
  }

  if (
    normalizeComparable(baseResume.coverLetter.companyAddress) !==
    normalizeComparable(optimizedResume.coverLetter.companyAddress)
  ) {
    pushSuggestion({
      op: "replace",
      path: "coverLetter.companyAddress",
      label: "Update cover letter company address",
      beforeText: baseResume.coverLetter.companyAddress,
      afterText: optimizedResume.coverLetter.companyAddress,
      value: optimizedResume.coverLetter.companyAddress,
    });
  }

  return suggestions;
};

const getAtPath = (source: unknown, path: string) => {
  const segments = parseFieldPath(path);
  let cursor: any = source;
  for (const segment of segments) {
    if (cursor == null) return undefined;
    cursor = cursor[segment as keyof typeof cursor];
  }
  return cursor;
};

const getParentAtPath = (source: unknown, path: string) => {
  const segments = parseFieldPath(path);
  if (segments.length === 0) return null;
  let cursor: any = source;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i];
    if (cursor == null) return null;
    cursor = cursor[segment as keyof typeof cursor];
  }
  return {
    parent: cursor,
    key: segments[segments.length - 1],
  };
};

const applySuggestionOperation = (
  resume: ResumeData,
  suggestion: AnalyzeSuggestion
) => {
  if (suggestion.op === "replace") {
    if (typeof suggestion.value === "string") {
      return setResumeValueAtPath(resume, suggestion.path, suggestion.value);
    }
    const next = structuredClone(resume);
    const target = getParentAtPath(next, suggestion.path);
    if (!target) return next;
    if (Array.isArray(target.parent) && typeof target.key === "number") {
      target.parent[target.key] = suggestion.value;
      return next;
    }
    if (target.parent && typeof target.key === "string") {
      (target.parent as Record<string, unknown>)[target.key] = suggestion.value;
    }
    return next;
  }

  const next = structuredClone(resume);

  if (suggestion.op === "delete") {
    const target = getParentAtPath(next, suggestion.path);
    if (!target) return next;
    if (Array.isArray(target.parent) && typeof target.key === "number") {
      target.parent.splice(target.key, 1);
    }
    return next;
  }

  if (suggestion.op === "insert") {
    const target = getAtPath(next, suggestion.path);
    if (!Array.isArray(target)) return next;
    const value = suggestion.value;
    if (value == null) return next;
    const index =
      typeof suggestion.insertIndex === "number"
        ? Math.min(Math.max(0, suggestion.insertIndex), target.length)
        : target.length;
    target.splice(index, 0, value);
    return next;
  }

  return next;
};

const applyAcceptedSuggestions = (
  baseResume: ResumeData,
  suggestions: AnalyzeSuggestion[]
) => {
  return suggestions
    .filter((suggestion) => suggestion.status === "accepted")
    .sort((a, b) => a.index - b.index)
    .reduce((current, suggestion) => {
      return applySuggestionOperation(current, suggestion);
    }, structuredClone(baseResume));
};

export function AppLayout() {
  const [formData, setFormData] = useState<ApplicationFormData>(initialFormData);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedSkills, setSelectedSkills] = useState<number[]>([]);
  const [defaultResumeData, setDefaultResumeData] =
    useState<ResumeData>(DEFAULT_RESUME_DATA);
  const [resumeData, setResumeData] = useState<ResumeData>(DEFAULT_RESUME_DATA);
  const [resumeAnalysis, setResumeAnalysis] =
    useState<ResumeAnalysisState | null>(null);
  const [isImportingResume, setIsImportingResume] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [analyzeMeta, setAnalyzeMeta] = useState<AnalyzeMeta | null>(null);
  const [analyzeSuggestions, setAnalyzeSuggestions] = useState<
    AnalyzeSuggestion[]
  >([]);
  const [analyzeBaseResume, setAnalyzeBaseResume] = useState<ResumeData | null>(
    null
  );
  const [analyzeOptimizedResume, setAnalyzeOptimizedResume] =
    useState<ResumeData | null>(null);
  const [analyzeDebugRaw, setAnalyzeDebugRaw] = useState<unknown>(null);
  const [pageCounts, setPageCounts] = useState({
    resumePages: 0,
    coverLetterPages: 0,
    isPrintPreviewMode: false,
  });

  const handleNewApplication = useCallback(() => {
    setFormData(initialFormData);
    setSelectedSkills([]);
    setResumeData(defaultResumeData);
    setResumeAnalysis(null);
    setImportError(null);
    setAnalyzeError(null);
    setAnalyzeMeta(null);
    setAnalyzeSuggestions([]);
    setAnalyzeBaseResume(null);
    setAnalyzeOptimizedResume(null);
    setAnalyzeDebugRaw(null);
    setPageCounts({
      resumePages: 0,
      coverLetterPages: 0,
      isPrintPreviewMode: false,
    });
  }, [defaultResumeData]);

  const handleResumeUpdate = useCallback((data: ResumeData) => {
    setResumeData(data);
  }, []);

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

  const handleAnalyze = useCallback(async () => {
    setIsAnalyzing(true);
    setAnalyzeError(null);
    setAnalyzeSuggestions([]);
    setAnalyzeDebugRaw(null);

    try {
      const baseResumeForAnalyze = structuredClone(defaultResumeData);
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          resumeData: baseResumeForAnalyze,
        }),
      });

      const rawText = await response.text();
      let payload: any = {};
      if (rawText) {
        try {
          payload = JSON.parse(rawText);
        } catch {
          throw new Error("Analyze failed. Server returned invalid JSON.");
        }
      }

      if (!response.ok) {
        throw new Error(payload?.error || "Failed to analyze job description.");
      }

      setAnalyzeDebugRaw(payload?.raw ?? payload ?? null);

      if (payload?.optimizedResume) {
        const optimized = payload.optimizedResume as ResumeData;
        const suggestions = buildAnalyzeSuggestions(
          baseResumeForAnalyze,
          optimized
        );
        setAnalyzeBaseResume(baseResumeForAnalyze);
        setAnalyzeOptimizedResume(optimized);
        setAnalyzeSuggestions(suggestions);
        setResumeData(baseResumeForAnalyze);
        setResumeAnalysis(null);
      }

      if (payload?.jobDescription) {
        setFormData((current) => ({
          ...current,
          jobDescription: payload.jobDescription,
        }));
      }

      setAnalyzeMeta({
        jobDescriptionSource: payload?.jobDescriptionSource ?? "manual",
        scrapeWarning: payload?.scrapeWarning ?? null,
        estimatedResumePages: payload?.estimation?.resumePages ?? 1,
        estimatedCoverLetterPages: payload?.estimation?.coverLetterPages ?? 1,
      });
      setAnalyzeError(payload?.fitError ?? null);
    } catch (error) {
      console.error("Error analyzing job description:", error);
      setAnalyzeError(
        error instanceof Error ? error.message : "Failed to analyze."
      );
      setAnalyzeMeta(null);
      setAnalyzeSuggestions([]);
      setAnalyzeBaseResume(null);
      setAnalyzeOptimizedResume(null);
      setAnalyzeDebugRaw(null);
    } finally {
      setIsAnalyzing(false);
    }
  }, [defaultResumeData, formData]);

  const handleImportResume = useCallback(async (file: File) => {
    setIsImportingResume(true);
    setImportError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/resume-import", {
        method: "POST",
        body: formData,
      });
      const rawText = await response.text();
      let payload: any = {};
      if (rawText) {
        try {
          payload = JSON.parse(rawText);
        } catch {
          throw new Error("Import failed. Server returned invalid JSON.");
        }
      }
      if (!response.ok) {
        throw new Error(payload?.error || "Import failed.");
      }

      setResumeData((current) =>
        buildResumeDataFromImport(current, payload.resume)
      );
      setResumeAnalysis({
        resume: payload.resume,
        fieldFeedback: payload.fieldFeedback,
        raw: payload.raw ?? payload,
      });
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

  const syncResumeFromAnalyzeSuggestions = useCallback(
    (nextSuggestions: AnalyzeSuggestion[], baseOverride?: ResumeData | null) => {
      const base = baseOverride ?? analyzeBaseResume;
      if (!base) return;
      const nextResume = applyAcceptedSuggestions(base, nextSuggestions);
      setResumeData(nextResume);
    },
    [analyzeBaseResume]
  );

  const handleAcceptAnalyzeSuggestion = useCallback(
    (suggestionId: string) => {
      setAnalyzeSuggestions((current) => {
        const nextSuggestions = current.map((suggestion) =>
          suggestion.id === suggestionId
            ? { ...suggestion, status: "accepted" as const }
            : suggestion
        );
        syncResumeFromAnalyzeSuggestions(nextSuggestions);
        return nextSuggestions;
      });
    },
    [syncResumeFromAnalyzeSuggestions]
  );

  const handleRejectAnalyzeSuggestion = useCallback(
    (suggestionId: string) => {
      setAnalyzeSuggestions((current) => {
        const nextSuggestions = current.map((suggestion) =>
          suggestion.id === suggestionId
            ? { ...suggestion, status: "rejected" as const }
            : suggestion
        );
        syncResumeFromAnalyzeSuggestions(nextSuggestions);
        return nextSuggestions;
      });
    },
    [syncResumeFromAnalyzeSuggestions]
  );

  const handleApplyAllAnalyzeSuggestions = useCallback(() => {
    if (analyzeOptimizedResume) {
      setResumeData(analyzeOptimizedResume);
    } else if (analyzeBaseResume) {
      setResumeData(
        applyAcceptedSuggestions(
          analyzeBaseResume,
          analyzeSuggestions.map((suggestion) => ({
            ...suggestion,
            status: "accepted" as const,
          }))
        )
      );
    }
    setAnalyzeSuggestions((current) =>
      current.map((suggestion) => ({
        ...suggestion,
        status: "accepted",
      }))
    );
  }, [analyzeBaseResume, analyzeOptimizedResume, analyzeSuggestions]);

  const handleDiscardAnalyzeSuggestions = useCallback(() => {
    setAnalyzeSuggestions([]);
    setAnalyzeBaseResume(null);
    setAnalyzeOptimizedResume(null);
    setAnalyzeDebugRaw(null);
  }, []);

  const handleResetResume = useCallback(() => {
    setResumeData(defaultResumeData);
    setResumeAnalysis(null);
    setAnalyzeSuggestions([]);
    setAnalyzeBaseResume(null);
    setAnalyzeOptimizedResume(null);
    setAnalyzeDebugRaw(null);
    setAnalyzeError(null);
  }, [defaultResumeData]);

  const handleSave = useCallback(async () => {
    try {
      const response = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          selectedSkills,
          resumeContent: resumeData,
          coverLetterContent: resumeData.coverLetter,
          notes: {
            selectedSkills,
            maxResumePages: formData.maxResumePages,
            pageCounts,
            analyzeMeta,
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save application");
      }

      // Reset form after successful save
      handleNewApplication();
    } catch (error) {
      console.error("Error saving application:", error);
    }
  }, [
    formData,
    selectedSkills,
    resumeData,
    pageCounts,
    analyzeMeta,
    handleNewApplication,
  ]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar onNewApplication={handleNewApplication} />

      <div className="flex flex-1 overflow-hidden">
        {/* Job Input Panel - 320px */}
        <div className="w-80 shrink-0 border-r border-border">
          <JobInputPanel
            formData={formData}
            onChange={setFormData}
            onAnalyze={handleAnalyze}
            onSave={handleSave}
            isAnalyzing={isAnalyzing}
            analyzeError={analyzeError}
            analyzeMeta={analyzeMeta}
            actualResumePages={pageCounts.resumePages}
            actualCoverLetterPages={pageCounts.coverLetterPages}
            isPrintPreviewMode={pageCounts.isPrintPreviewMode}
            analyzeSuggestions={analyzeSuggestions}
            onAcceptAnalyzeSuggestion={handleAcceptAnalyzeSuggestion}
            onRejectAnalyzeSuggestion={handleRejectAnalyzeSuggestion}
            onApplyAllAnalyzeSuggestions={handleApplyAllAnalyzeSuggestions}
            onDiscardAnalyzeSuggestions={handleDiscardAnalyzeSuggestions}
            onResetResume={handleResetResume}
          />
        </div>

        {/* Resume Viewer - flex-1 */}
        <div className="flex-1 overflow-hidden">
          <ResumeViewer
            resumeData={resumeData}
            onResumeUpdate={handleResumeUpdate}
            analysis={resumeAnalysis}
            onApplySuggestion={handleApplySuggestion}
            maxResumePages={formData.maxResumePages}
            onPageCountChange={setPageCounts}
            debugData={analyzeDebugRaw}
            onApplyDebugChanges={handleApplyAllAnalyzeSuggestions}
          />
        </div>

        {/* Resume Editor Panel - 460px */}
        <div className="w-[460px] shrink-0 border-l border-border">
          <ResumeEditorPanel
            resumeData={resumeData}
            onResumeUpdate={handleResumeUpdate}
            onImportResume={handleImportResume}
            isImportingResume={isImportingResume}
            importError={importError}
          />
        </div>
      </div>
    </div>
  );
}
