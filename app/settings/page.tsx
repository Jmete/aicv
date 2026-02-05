"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bell, FileText, Palette } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DEFAULT_LAYOUT_PREFERENCES, DEFAULT_RESUME_DATA } from "@/lib/resume-defaults";
import { cn } from "@/lib/utils";
import type { ResumeData } from "@/types";
import { EducationEditor } from "@/components/resume-editor/education-editor";
import { ExperienceEditor } from "@/components/resume-editor/experience-editor";
import { MetadataEditor } from "@/components/resume-editor/metadata-editor";
import { ProjectsEditor } from "@/components/resume-editor/projects-editor";
import { SkillsEditor } from "@/components/resume-editor/skills-editor";

const settingsOptions = [
  {
    id: "resume-data",
    label: "Resume Data",
    description: "Manage your core resume details and sections.",
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
];

export default function SettingsPage() {
  const [resumeData, setResumeData] = useState<ResumeData>(DEFAULT_RESUME_DATA);
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  const layoutPreferences = useMemo(
    () => ({
      ...DEFAULT_LAYOUT_PREFERENCES,
      ...resumeData.layoutPreferences,
      contactOrder:
        resumeData.layoutPreferences?.contactOrder ??
        DEFAULT_LAYOUT_PREFERENCES.contactOrder,
      headerAlignment: {
        ...DEFAULT_LAYOUT_PREFERENCES.headerAlignment,
        ...resumeData.layoutPreferences?.headerAlignment,
      },
      fontPreferences: {
        ...DEFAULT_LAYOUT_PREFERENCES.fontPreferences,
        ...resumeData.layoutPreferences?.fontPreferences,
        sizes: {
          ...DEFAULT_LAYOUT_PREFERENCES.fontPreferences.sizes,
          ...resumeData.layoutPreferences?.fontPreferences?.sizes,
        },
      },
      coverLetterFontPreferences: {
        ...DEFAULT_LAYOUT_PREFERENCES.coverLetterFontPreferences,
        ...resumeData.layoutPreferences?.coverLetterFontPreferences,
        sizes: {
          ...DEFAULT_LAYOUT_PREFERENCES.coverLetterFontPreferences.sizes,
          ...resumeData.layoutPreferences?.coverLetterFontPreferences?.sizes,
        },
      },
    }),
    [resumeData.layoutPreferences]
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
        </header>

        <div className="flex flex-1 overflow-hidden">
          <div className="w-80 shrink-0 border-r border-border">
            <div className="flex h-full flex-col">
              <ScrollArea className="flex-1">
                <ul className="space-y-2 p-4">
                  {settingsOptions.map((option) => {
                    const Icon = option.icon;
                    return (
                      <li key={option.id}>
                        <div
                          className={cn(
                            "flex items-start gap-3 rounded-md border border-transparent px-3 py-2",
                            option.id === "resume-data" && "border-border bg-accent"
                          )}
                        >
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
                      </li>
                    );
                  })}
                </ul>
              </ScrollArea>
            </div>
          </div>

          <div className="flex-1 overflow-hidden p-8">
            <div
              className={cn(
                "mb-2 text-xs",
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
            <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card">
              <Tabs defaultValue="info" className="flex h-full flex-col">
                <div className="flex h-[52px] items-center border-b border-border px-4">
                  <TabsList className="grid h-full w-full grid-cols-5 bg-transparent p-0">
                    <TabsTrigger
                      value="info"
                      className="h-full rounded-none border-b-2 border-transparent px-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent"
                    >
                      Info
                    </TabsTrigger>
                    <TabsTrigger
                      value="experience"
                      className="h-full rounded-none border-b-2 border-transparent px-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent"
                    >
                      Experience
                    </TabsTrigger>
                    <TabsTrigger
                      value="projects"
                      className="h-full rounded-none border-b-2 border-transparent px-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent"
                    >
                      Projects
                    </TabsTrigger>
                    <TabsTrigger
                      value="education"
                      className="h-full rounded-none border-b-2 border-transparent px-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent"
                    >
                      Education
                    </TabsTrigger>
                    <TabsTrigger
                      value="skills"
                      className="h-full rounded-none border-b-2 border-transparent px-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent"
                    >
                      Skills
                    </TabsTrigger>
                  </TabsList>
                </div>

                <ScrollArea className="flex-1">
                  <div className="p-6">
                    {isLoading ? (
                      <p className="text-sm text-muted-foreground">
                        Loading resume data...
                      </p>
                    ) : (
                      <>
                        <TabsContent value="info" className="m-0">
                          <MetadataEditor
                            metadata={resumeData.metadata}
                            contactOrder={layoutPreferences.contactOrder}
                            onChange={(metadata) =>
                              setResumeData({ ...resumeData, metadata })
                            }
                            onContactOrderChange={(contactOrder) =>
                              setResumeData({
                                ...resumeData,
                                layoutPreferences: {
                                  ...layoutPreferences,
                                  contactOrder,
                                },
                              })
                            }
                          />
                        </TabsContent>

                        <TabsContent value="experience" className="m-0">
                          <ExperienceEditor
                            experience={resumeData.experience}
                            order={layoutPreferences.experienceOrder}
                            onOrderChange={(experienceOrder) =>
                              setResumeData({
                                ...resumeData,
                                layoutPreferences: {
                                  ...layoutPreferences,
                                  experienceOrder,
                                },
                              })
                            }
                            onChange={(experience) =>
                              setResumeData({ ...resumeData, experience })
                            }
                          />
                        </TabsContent>

                        <TabsContent value="projects" className="m-0">
                          <ProjectsEditor
                            projects={resumeData.projects}
                            onChange={(projects) =>
                              setResumeData({ ...resumeData, projects })
                            }
                          />
                        </TabsContent>

                        <TabsContent value="education" className="m-0">
                          <EducationEditor
                            education={resumeData.education}
                            order={layoutPreferences.educationOrder}
                            onOrderChange={(educationOrder) =>
                              setResumeData({
                                ...resumeData,
                                layoutPreferences: {
                                  ...layoutPreferences,
                                  educationOrder,
                                },
                              })
                            }
                            onChange={(education) =>
                              setResumeData({ ...resumeData, education })
                            }
                          />
                        </TabsContent>

                        <TabsContent value="skills" className="m-0">
                          <SkillsEditor
                            skills={resumeData.skills}
                            onChange={(skills) =>
                              setResumeData({ ...resumeData, skills })
                            }
                          />
                        </TabsContent>
                      </>
                    )}
                  </div>
                </ScrollArea>
              </Tabs>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
