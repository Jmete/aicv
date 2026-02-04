"use client";

import { useState, useCallback } from "react";
import { Sidebar } from "./sidebar";
import { JobInputPanel } from "@/components/panels/job-input-panel";
import { ResumeViewer } from "@/components/panels/resume-viewer";
import { ResumeEditorPanel } from "@/components/resume-editor";
import { DEFAULT_RESUME_DATA } from "@/lib/resume-defaults";
import type { ResumeData } from "@/types";

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
  const [resumeData, setResumeData] = useState<ResumeData>(DEFAULT_RESUME_DATA);

  const handleNewApplication = useCallback(() => {
    setFormData(initialFormData);
    setSelectedSkills([]);
    setResumeData(DEFAULT_RESUME_DATA);
  }, []);

  const handleResumeUpdate = useCallback((data: ResumeData) => {
    setResumeData(data);
  }, []);

  const handleAnalyze = useCallback(async () => {
    setIsAnalyzing(true);
    // Stub: simulate analysis delay
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setIsAnalyzing(false);
  }, []);

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
          />
        </div>

        {/* Resume Editor Panel - 420px */}
        <div className="w-[420px] shrink-0 border-l border-border">
          <ResumeEditorPanel
            resumeData={resumeData}
            onResumeUpdate={handleResumeUpdate}
          />
        </div>
      </div>
    </div>
  );
}
