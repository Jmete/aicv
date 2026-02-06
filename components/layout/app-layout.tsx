"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { Sidebar } from "./sidebar";
import { JobInputPanel } from "@/components/panels/job-input-panel";
import { ResumeViewer } from "@/components/panels/resume-viewer";
import { ResumeEditorPanel } from "@/components/resume-editor";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
  allowDeletions: boolean;
}

const initialFormData: ApplicationFormData = {
  companyName: "",
  jobTitle: "",
  jobUrl: "",
  jobDescription: "",
  maxResumePages: 1,
  allowDeletions: false,
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
  patchPath?: string;
  label: string;
  beforeText?: string;
  afterText?: string;
  value?: unknown;
  insertIndex?: number;
  keywordsCovered?: string[];
  lineDelta?: number;
  confidence?: number;
  evidenceLevel?: "explicit" | "conservative_rephrase";
  manualApprovalRequired?: boolean;
}

interface TuneDiff {
  op: "replace" | "insert" | "delete";
  path: string;
  patchPath: string;
  before: string | null;
  after: string | null;
  keywordsCovered: string[];
  lineDelta: number;
  confidence: number;
  evidenceLevel: "explicit" | "conservative_rephrase";
  manualApprovalRequired: boolean;
}

const createId = () =>
  typeof crypto !== "undefined"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

const normalizeComparable = (value: string) =>
  value.replace(/\s+/g, " ").trim();

const hasText = (value: string | undefined | null) =>
  typeof value === "string" && normalizeComparable(value).length > 0;

const withProjectTitleGuardrails = (
  baseResume: ResumeData,
  nextResume: ResumeData
): ResumeData => {
  const baseById = new Map(baseResume.projects.map((project) => [project.id, project]));
  const projects = nextResume.projects.map((project, index) => {
    const byId = baseById.get(project.id);
    const byIndex = baseResume.projects[index];
    const fallbackName = byId?.name ?? byIndex?.name ?? "";
    const fallbackId = byId?.id ?? byIndex?.id ?? project.id;
    return {
      ...project,
      id: hasText(project.id) ? project.id : fallbackId,
      name: hasText(project.name) ? project.name : fallbackName,
    };
  });
  return { ...nextResume, projects };
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

const withResumeIntegrityGuardrails = (
  nextResume: ResumeData,
  baseResume?: ResumeData
): ResumeData => {
  const seeded = baseResume
    ? withProjectTitleGuardrails(baseResume, nextResume)
    : nextResume;
  return {
    ...seeded,
    experience: ensureUniqueIds(seeded.experience),
    projects: ensureUniqueIds(seeded.projects),
    education: ensureUniqueIds(seeded.education),
    skills: ensureUniqueIds(seeded.skills),
  };
};

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

const attachTuneDiffMeta = (
  suggestions: AnalyzeSuggestion[],
  diffs: TuneDiff[]
) => {
  const buckets = new Map<string, TuneDiff[]>();
  for (const diff of diffs) {
    const key = `${diff.op}:${diff.path}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.push(diff);
    } else {
      buckets.set(key, [diff]);
    }
  }

  return suggestions.map((suggestion) => {
    const key = `${suggestion.op}:${suggestion.path}`;
    const queue = buckets.get(key);
    const match = queue?.shift();
    if (!match) return suggestion;
    return {
      ...suggestion,
      patchPath: match.patchPath,
      keywordsCovered: match.keywordsCovered,
      lineDelta: match.lineDelta,
      confidence: match.confidence,
      evidenceLevel: match.evidenceLevel,
      manualApprovalRequired: match.manualApprovalRequired,
    };
  });
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

const getPathWithoutIndexSuffix = (path: string) =>
  path.replace(/\[\d+\]$/, "");

const buildSuggestionHighlightPaths = (
  suggestion: AnalyzeSuggestion,
  side: "before" | "after"
) => {
  const paths = new Set<string>();
  const addPath = (value?: string | null) => {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (!trimmed) return;
    paths.add(trimmed);
  };

  if (suggestion.op === "replace") {
    addPath(suggestion.path);
    addPath(suggestion.patchPath);
  }

  if (suggestion.op === "delete") {
    if (side === "before") {
      addPath(suggestion.path);
      addPath(suggestion.patchPath);
    } else {
      addPath(getPathWithoutIndexSuffix(suggestion.path));
    }
  }

  if (suggestion.op === "insert") {
    if (side === "before") {
      addPath(suggestion.path);
      addPath(suggestion.patchPath);
    } else {
      if (typeof suggestion.insertIndex === "number") {
        const itemPath = `${suggestion.path}[${suggestion.insertIndex}]`;
        addPath(itemPath);
        addPath(`${itemPath}.name`);
        addPath(`${itemPath}.bullets`);
      } else {
        addPath(suggestion.path);
      }
      addPath(suggestion.patchPath);
    }
  }

  return [...paths];
};

const getSuggestionDocumentTab = (
  suggestion: AnalyzeSuggestion
): "resume" | "cover-letter" => {
  const effectivePath = suggestion.patchPath ?? suggestion.path;
  return effectivePath.startsWith("coverLetter.") ? "cover-letter" : "resume";
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
  const [, setAnalyzeOptimizedResume] = useState<ResumeData | null>(null);
  const [analyzeDebugRaw, setAnalyzeDebugRaw] = useState<unknown>(null);
  const [pageCounts, setPageCounts] = useState({
    resumePages: 0,
    coverLetterPages: 0,
    isPrintPreviewMode: false,
  });
  const [isDiffViewOpen, setIsDiffViewOpen] = useState(false);
  const [hoveredSuggestionId, setHoveredSuggestionId] = useState<string | null>(
    null
  );
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [diffDocumentTab, setDiffDocumentTab] = useState<
    "resume" | "cover-letter"
  >("resume");

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
    setIsDiffViewOpen(false);
    setHoveredSuggestionId(null);
    setDiffDocumentTab("resume");
    setPageCounts({
      resumePages: 0,
      coverLetterPages: 0,
      isPrintPreviewMode: false,
    });
  }, [defaultResumeData]);

  const handleResumeUpdate = useCallback((data: ResumeData) => {
    setResumeData(withResumeIntegrityGuardrails(data));
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
    setHoveredSuggestionId(null);
    setDiffDocumentTab("resume");

    try {
      const baseResumeForAnalyze = structuredClone(
        withResumeIntegrityGuardrails(resumeData)
      );
      const response = await fetch("/api/tune-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          allowedAdditions: [],
          resumeData: baseResumeForAnalyze,
        }),
      });

      const rawText = await response.text();
      let payload: any = {};
      if (rawText) {
        try {
          payload = JSON.parse(rawText);
        } catch {
          throw new Error("Tune failed. Server returned invalid JSON.");
        }
      }

      if (!response.ok) {
        throw new Error(payload?.error || "Failed to tune resume.");
      }

      setAnalyzeDebugRaw(payload?.raw ?? payload ?? null);

      if (payload?.optimizedResume) {
        const optimized = withResumeIntegrityGuardrails(
          payload.optimizedResume as ResumeData,
          baseResumeForAnalyze
        );
        const suggestions = buildAnalyzeSuggestions(
          baseResumeForAnalyze,
          optimized
        );
        const tunedSuggestions = Array.isArray(payload?.diffs)
          ? attachTuneDiffMeta(suggestions, payload.diffs as TuneDiff[])
          : suggestions;
        const filteredSuggestions = formData.allowDeletions
          ? tunedSuggestions
          : tunedSuggestions.filter((suggestion) => suggestion.op !== "delete");
        setAnalyzeBaseResume(baseResumeForAnalyze);
        setAnalyzeOptimizedResume(optimized);
        setAnalyzeSuggestions(filteredSuggestions);
        setResumeData(baseResumeForAnalyze);
        setResumeAnalysis(null);
        setIsDiffViewOpen(filteredSuggestions.length > 0);
        const hasResumeDiff = filteredSuggestions.some(
          (suggestion) => getSuggestionDocumentTab(suggestion) === "resume"
        );
        setDiffDocumentTab(hasResumeDiff ? "resume" : "cover-letter");
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
      console.error("Error tuning resume:", error);
      setAnalyzeError(
        error instanceof Error ? error.message : "Failed to tune."
      );
      setAnalyzeMeta(null);
      setAnalyzeSuggestions([]);
      setAnalyzeBaseResume(null);
      setAnalyzeOptimizedResume(null);
      setAnalyzeDebugRaw(null);
      setIsDiffViewOpen(false);
      setHoveredSuggestionId(null);
      setDiffDocumentTab("resume");
    } finally {
      setIsAnalyzing(false);
    }
  }, [formData, resumeData]);

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

      if (payload?.mode === "resume-data" && payload?.resumeData) {
        const nextResumeData = withResumeIntegrityGuardrails(
          payload.resumeData as ResumeData
        );
        setResumeData(nextResumeData);
        setDefaultResumeData(nextResumeData);
        setResumeAnalysis(null);
        setAnalyzeSuggestions([]);
        setAnalyzeBaseResume(null);
        setAnalyzeOptimizedResume(null);
        setAnalyzeDebugRaw(null);
        setAnalyzeError(null);
        setIsDiffViewOpen(false);
        setHoveredSuggestionId(null);
        setDiffDocumentTab("resume");

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
      setResumeData(withResumeIntegrityGuardrails(nextResume, base));
    },
    [analyzeBaseResume]
  );

  const handleAcceptAnalyzeSuggestion = useCallback(
    (suggestionId: string) => {
      setAnalyzeSuggestions((current) => {
        const nextSuggestions = current.map((suggestion) =>
          suggestion.id === suggestionId
            ? suggestion.op === "delete" && !formData.allowDeletions
              ? suggestion
              : { ...suggestion, status: "accepted" as const }
            : suggestion
        );
        syncResumeFromAnalyzeSuggestions(nextSuggestions);
        return nextSuggestions;
      });
    },
    [formData.allowDeletions, syncResumeFromAnalyzeSuggestions]
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

  const handleResetAnalyzeSuggestion = useCallback(
    (suggestionId: string) => {
      setAnalyzeSuggestions((current) => {
        const nextSuggestions = current.map((suggestion) =>
          suggestion.id === suggestionId
            ? { ...suggestion, status: "pending" as const }
            : suggestion
        );
        syncResumeFromAnalyzeSuggestions(nextSuggestions);
        return nextSuggestions;
      });
    },
    [syncResumeFromAnalyzeSuggestions]
  );

  const handleApplyAllAnalyzeSuggestions = useCallback(() => {
    if (!analyzeBaseResume) return;
    setAnalyzeSuggestions((current) => {
      const nextSuggestions = current.map((suggestion) => {
        if (suggestion.status !== "pending") return suggestion;
        if (suggestion.op === "delete" || suggestion.manualApprovalRequired) {
          return suggestion;
        }
        return { ...suggestion, status: "accepted" as const };
      });
      syncResumeFromAnalyzeSuggestions(nextSuggestions, analyzeBaseResume);
      return nextSuggestions;
    });
  }, [analyzeBaseResume, syncResumeFromAnalyzeSuggestions]);

  const handleDiscardAnalyzeSuggestions = useCallback(() => {
    setAnalyzeSuggestions([]);
    setAnalyzeBaseResume(null);
    setAnalyzeOptimizedResume(null);
    setAnalyzeDebugRaw(null);
    setIsDiffViewOpen(false);
    setHoveredSuggestionId(null);
    setDiffDocumentTab("resume");
  }, []);

  const handleResetResume = useCallback(() => {
    setResumeData(defaultResumeData);
    setResumeAnalysis(null);
    setAnalyzeSuggestions([]);
    setAnalyzeBaseResume(null);
    setAnalyzeOptimizedResume(null);
    setAnalyzeDebugRaw(null);
    setAnalyzeError(null);
    setIsDiffViewOpen(false);
    setHoveredSuggestionId(null);
    setDiffDocumentTab("resume");
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

  const hasDiffData = Boolean(analyzeBaseResume && analyzeSuggestions.length > 0);
  const showDiffView = hasDiffData && isDiffViewOpen;
  const visibleDiffSuggestions = useMemo(
    () =>
      analyzeSuggestions.filter(
        (suggestion) => getSuggestionDocumentTab(suggestion) === diffDocumentTab
      ),
    [analyzeSuggestions, diffDocumentTab]
  );
  const pendingSuggestions = useMemo(
    () => analyzeSuggestions.filter((suggestion) => suggestion.status === "pending"),
    [analyzeSuggestions]
  );
  const visiblePendingSuggestions = useMemo(
    () =>
      visibleDiffSuggestions.filter((suggestion) => suggestion.status === "pending"),
    [visibleDiffSuggestions]
  );
  const visibleAcceptedSuggestionCount = useMemo(
    () =>
      visibleDiffSuggestions.filter(
        (suggestion) => suggestion.status === "accepted"
      ).length,
    [visibleDiffSuggestions]
  );
  const visibleRejectedSuggestionCount = useMemo(
    () =>
      visibleDiffSuggestions.filter(
        (suggestion) => suggestion.status === "rejected"
      ).length,
    [visibleDiffSuggestions]
  );
  const handleReadOnlyResumeUpdate = useCallback((_data: ResumeData) => {}, []);
  const handleReadOnlyApplySuggestion = useCallback(
    (_path: string, _suggestionId: string, _replacement: string) => {},
    []
  );
  const hoveredSuggestion = useMemo(
    () =>
      visibleDiffSuggestions.find(
        (suggestion) => suggestion.id === hoveredSuggestionId
      ) ?? null,
    [hoveredSuggestionId, visibleDiffSuggestions]
  );
  const beforeHighlightPaths = useMemo(
    () =>
      hoveredSuggestion
        ? buildSuggestionHighlightPaths(hoveredSuggestion, "before")
        : [],
    [hoveredSuggestion]
  );
  const afterHighlightPaths = useMemo(
    () =>
      hoveredSuggestion
        ? buildSuggestionHighlightPaths(hoveredSuggestion, "after")
        : [],
    [hoveredSuggestion]
  );
  const rightPreviewResumeData = useMemo(() => {
    if (!analyzeBaseResume) return resumeData;
    const previewSuggestions = analyzeSuggestions.map((suggestion) =>
      suggestion.status === "rejected"
        ? suggestion
        : { ...suggestion, status: "accepted" as const }
    );
    return withResumeIntegrityGuardrails(
      applyAcceptedSuggestions(analyzeBaseResume, previewSuggestions),
      analyzeBaseResume
    );
  }, [analyzeBaseResume, analyzeSuggestions, resumeData]);

  useEffect(() => {
    setHoveredSuggestionId(null);
  }, [diffDocumentTab, showDiffView]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar onNewApplication={handleNewApplication} />

      <div className="flex flex-1 overflow-hidden">
        {/* Job Input Panel */}
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
                onResetAnalyzeSuggestion={handleResetAnalyzeSuggestion}
                onApplyAllAnalyzeSuggestions={handleApplyAllAnalyzeSuggestions}
                onDiscardAnalyzeSuggestions={handleDiscardAnalyzeSuggestions}
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

        {/* Resume Viewer - flex-1 */}
        <div className="flex-1 overflow-hidden">
          {showDiffView && analyzeBaseResume ? (
            <div className="flex h-full flex-col">
              <div className="border-b border-border bg-card/40 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium text-foreground">
                      Resume Diff Review
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {visiblePendingSuggestions.length} pending • {visibleAcceptedSuggestionCount} approved • {visibleRejectedSuggestionCount} denied
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      onClick={handleApplyAllAnalyzeSuggestions}
                    >
                      Approve Safe
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => {
                        setIsDiffViewOpen(false);
                        setHoveredSuggestionId(null);
                      }}
                    >
                      Close Diff
                    </Button>
                  </div>
                </div>
              </div>
              <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_340px]">
                <div className="flex min-h-0 flex-col border-r border-border">
                  <div className="border-b border-border bg-muted/20 px-3 py-2">
                    <p className="text-[11px] font-medium text-foreground">
                      Original Resume
                    </p>
                  </div>
                  <div className="min-h-0 flex-1 overflow-hidden">
                    <ResumeViewer
                      resumeData={analyzeBaseResume}
                      onResumeUpdate={handleReadOnlyResumeUpdate}
                      analysis={null}
                      onApplySuggestion={handleReadOnlyApplySuggestion}
                      readOnly
                      allowCoverLetterTabInReadOnly
                      autoScaleToFit
                      documentTab={diffDocumentTab}
                      onDocumentTabChange={setDiffDocumentTab}
                      highlightFieldPaths={beforeHighlightPaths}
                      highlightTone="before"
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
                      resumeData={rightPreviewResumeData}
                      onResumeUpdate={handleResumeUpdate}
                      analysis={null}
                      onApplySuggestion={handleReadOnlyApplySuggestion}
                      readOnly
                      allowCoverLetterTabInReadOnly
                      autoScaleToFit
                      documentTab={diffDocumentTab}
                      onDocumentTabChange={setDiffDocumentTab}
                      highlightFieldPaths={afterHighlightPaths}
                      highlightTone="after"
                    />
                  </div>
                </div>
                <div className="flex min-h-0 flex-col border-l border-border bg-card/20">
                  <div className="border-b border-border px-3 py-2">
                    <p className="text-xs font-medium text-foreground">
                      {diffDocumentTab === "resume"
                        ? "Resume Diff Suggestions"
                        : "Cover Letter Diff Suggestions"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Hover a suggestion to highlight before/after on both PDFs.
                    </p>
                  </div>
                  <ScrollArea className="min-h-0 flex-1">
                    <div className="space-y-2 p-3">
                      {visibleDiffSuggestions.length === 0 ? (
                        <div className="rounded-md border border-dashed border-border bg-background p-3 text-[11px] text-muted-foreground">
                          No suggestions for this tab.
                        </div>
                      ) : (
                        visibleDiffSuggestions.map((suggestion) => (
                        <div
                          key={suggestion.id}
                          className={`rounded-md border bg-background p-2 ${
                            hoveredSuggestionId === suggestion.id
                              ? "border-primary/60 ring-1 ring-primary/40"
                              : "border-border"
                          }`}
                          onMouseEnter={() => setHoveredSuggestionId(suggestion.id)}
                          onMouseLeave={() => setHoveredSuggestionId((current) =>
                            current === suggestion.id ? null : current
                          )}
                          onFocus={() => setHoveredSuggestionId(suggestion.id)}
                          onBlur={() => setHoveredSuggestionId((current) =>
                            current === suggestion.id ? null : current
                          )}
                          tabIndex={0}
                        >
                          <p className="text-[11px] font-medium text-foreground">
                            {suggestion.label}
                          </p>
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            {suggestion.op.toUpperCase()} • {suggestion.path}
                          </p>
                          {suggestion.beforeText ? (
                            <p className="mt-1 text-[10px] text-muted-foreground line-clamp-2">
                              Before: {suggestion.beforeText}
                            </p>
                          ) : null}
                          {suggestion.afterText ? (
                            <p className="mt-1 text-[10px] text-foreground line-clamp-2">
                              After: {suggestion.afterText}
                            </p>
                          ) : null}
                          <div className="mt-2 flex items-center justify-between">
                            <span className="text-[10px] text-muted-foreground capitalize">
                              {suggestion.status}
                            </span>
                            <div className="flex items-center gap-1">
                              {suggestion.status === "pending" ? (
                                <>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-[10px]"
                                    onClick={() =>
                                      handleRejectAnalyzeSuggestion(suggestion.id)
                                    }
                                  >
                                    Deny
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    className="h-6 px-2 text-[10px]"
                                    onClick={() =>
                                      handleAcceptAnalyzeSuggestion(suggestion.id)
                                    }
                                    disabled={
                                      suggestion.op === "delete" &&
                                      !formData.allowDeletions
                                    }
                                  >
                                    Approve
                                  </Button>
                                </>
                              ) : (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-[10px]"
                                  onClick={() =>
                                    handleResetAnalyzeSuggestion(suggestion.id)
                                  }
                                >
                                  Reset
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </div>
          ) : hasDiffData ? (
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-border bg-card/40 px-3 py-2">
                <div>
                  <p className="text-xs font-medium text-foreground">
                    Diff review is hidden
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {pendingSuggestions.length} pending suggestions are ready for review.
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
                    onClick={handleDiscardAnalyzeSuggestions}
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
                  maxResumePages={formData.maxResumePages}
                  onPageCountChange={setPageCounts}
                  debugData={analyzeDebugRaw}
                  onApplyDebugChanges={handleApplyAllAnalyzeSuggestions}
                />
              </div>
            </div>
          ) : (
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
          )}
        </div>

        {/* Resume Editor Panel */}
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
    </div>
  );
}
