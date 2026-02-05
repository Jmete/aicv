"use client";

import { useState, useCallback, useEffect } from "react";
import { Sidebar } from "./sidebar";
import { JobInputPanel } from "@/components/panels/job-input-panel";
import { ResumeViewer } from "@/components/panels/resume-viewer";
import { ResumeEditorPanel } from "@/components/resume-editor";
import { DEFAULT_RESUME_DATA } from "@/lib/resume-defaults";
import { buildResumeDataFromImport, setResumeValueAtPath } from "@/lib/resume-analysis";
import type { ResumeAnalysisState, ResumeData } from "@/types";

export interface ApplicationFormData {
  companyName: string;
  jobTitle: string;
  jobUrl: string;
  jobDescription: string;
}

const initialFormData: ApplicationFormData = {
  companyName: "",
  jobTitle: "",
  jobUrl: "",
  jobDescription: "",
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

  const handleNewApplication = useCallback(() => {
    setFormData(initialFormData);
    setSelectedSkills([]);
    setResumeData(defaultResumeData);
    setResumeAnalysis(null);
    setImportError(null);
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
    // Stub: simulate analysis delay
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setIsAnalyzing(false);
  }, []);

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
        const nextFeedback = current.fieldFeedback.map((entry) => {
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

  const handleSave = useCallback(async () => {
    try {
      const response = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          selectedSkills,
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
  }, [formData, selectedSkills, handleNewApplication]);

  const handleSkillToggle = useCallback((skillId: number) => {
    setSelectedSkills((prev) =>
      prev.includes(skillId)
        ? prev.filter((id) => id !== skillId)
        : [...prev, skillId]
    );
  }, []);

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
          />
        </div>

        {/* Resume Viewer - flex-1 */}
        <div className="flex-1 overflow-hidden">
          <ResumeViewer
            resumeData={resumeData}
            onResumeUpdate={handleResumeUpdate}
            analysis={resumeAnalysis}
            onApplySuggestion={handleApplySuggestion}
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
