"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bell, FileText, Palette } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import { ResumeViewer } from "@/components/panels/resume-viewer";
import { ResumeEditorPanel } from "@/components/resume-editor";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { buildResumeDataFromImport, setResumeValueAtPath } from "@/lib/resume-analysis";
import { DEFAULT_RESUME_DATA } from "@/lib/resume-defaults";
import { cn } from "@/lib/utils";
import type { FieldFeedback, ResumeAnalysisState, ResumeData } from "@/types";

const settingsOptions = [
  {
    id: "default-resume",
    label: "Default Resume",
    description: "Edit and save the default resume used in the main editor.",
    icon: FileText,
  },
  {
    id: "appearance",
    label: "Appearance",
    description: "Theme, typography, and document defaults.",
    icon: Palette,
  },
  {
    id: "notifications",
    label: "Notifications",
    description: "Control alerts and status updates.",
    icon: Bell,
  },
] as const;

type SettingsOptionId = (typeof settingsOptions)[number]["id"];

export default function SettingsPage() {
  const [resumeData, setResumeData] = useState<ResumeData>(DEFAULT_RESUME_DATA);
  const [isLoading, setIsLoading] = useState(true);
  const [resumeAnalysis, setResumeAnalysis] =
    useState<ResumeAnalysisState | null>(null);
  const [isImportingResume, setIsImportingResume] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [activeOption, setActiveOption] =
    useState<SettingsOptionId>("default-resume");

  const activeOptionData = settingsOptions.find(
    (option) => option.id === activeOption
  );

  const handleResumeUpdate = useCallback((data: ResumeData) => {
    setResumeData(data);
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

      if (payload?.mode === "resume-data" && payload?.resumeData) {
        const nextResumeData = payload.resumeData as ResumeData;
        setResumeData(nextResumeData);
        setResumeAnalysis(null);
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
        const categoryMatch = path.match(/^skills\[(\d+)\]\.category$/);
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

  useEffect(() => {
    let isActive = true;

    async function loadResumeData() {
      try {
        const response = await fetch("/api/resume-data");
        if (!response.ok) return;
        const data = await response.json();
        if (isActive) {
          setResumeData(data);
          setResumeAnalysis(null);
          setImportError(null);
          setSaveStatus("saved");
        }
      } catch (error) {
        console.error("Error loading resume data:", error);
        if (isActive) {
          setSaveStatus("error");
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    loadResumeData();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (isLoading) return;
    setSaveStatus("saving");
    const timeout = setTimeout(async () => {
      try {
        const response = await fetch("/api/resume-data", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(resumeData),
        });
        if (!response.ok) {
          throw new Error("Save failed");
        }
        setSaveStatus("saved");
      } catch (error) {
        console.error("Error saving resume data:", error);
        setSaveStatus("error");
      }
    }, 500);

    return () => clearTimeout(timeout);
  }, [isLoading, resumeData]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center gap-4 border-b border-border px-6 py-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Back to editor</span>
            </Link>
          </Button>
          <h1 className="text-sm font-medium">Settings</h1>
          <p className="text-xs text-muted-foreground">{activeOptionData?.description}</p>
          {activeOption === "default-resume" && (
            <div
              className={cn(
                "ml-auto text-xs",
                saveStatus === "error"
                  ? "text-destructive"
                  : "text-muted-foreground"
              )}
            >
              {isLoading
                ? "Loading..."
                : saveStatus === "saving"
                ? "Saving..."
                : saveStatus === "error"
                ? "Save failed"
                : "Saved"}
            </div>
          )}
        </header>

        <div className="flex flex-1 overflow-hidden">
          <div className="w-80 shrink-0 border-r border-border">
            <ScrollArea className="h-full">
              <ul className="space-y-2 p-4">
                {settingsOptions.map((option) => {
                  const Icon = option.icon;
                  const isActive = option.id === activeOption;
                  return (
                    <li key={option.id}>
                      <button
                        type="button"
                        className={cn(
                          "w-full rounded-md border px-3 py-2 text-left transition-colors",
                          isActive
                            ? "border-border bg-accent"
                            : "border-transparent hover:bg-muted"
                        )}
                        onClick={() => setActiveOption(option.id)}
                      >
                        <div className="flex items-start gap-3">
                          <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {option.label}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {option.description}
                            </p>
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
          </div>

          {activeOption === "default-resume" ? (
            <>
              <div className="flex-1 overflow-hidden">
                <ResumeViewer
                  resumeData={resumeData}
                  onResumeUpdate={handleResumeUpdate}
                  analysis={resumeAnalysis}
                  onApplySuggestion={handleApplySuggestion}
                />
              </div>

              <div className="w-[460px] shrink-0 border-l border-border">
                <ResumeEditorPanel
                  resumeData={resumeData}
                  onResumeUpdate={handleResumeUpdate}
                  onImportResume={handleImportResume}
                  isImportingResume={isImportingResume}
                  importError={importError}
                />
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8">
              <div className="max-w-md rounded-lg border border-border bg-card p-6">
                <h2 className="text-sm font-medium text-foreground">
                  {activeOptionData?.label}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  This section is available in the menu and can be expanded next.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
