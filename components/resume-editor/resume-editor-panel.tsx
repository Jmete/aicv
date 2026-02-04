"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ResumeData } from "@/types";
import { CoverLetterEditor } from "./cover-letter-editor";
import { EducationEditor } from "./education-editor";
import { ExperienceEditor } from "./experience-editor";
import { MetadataEditor } from "./metadata-editor";
import { PageSettings } from "./page-settings";
import { ProjectsEditor } from "./projects-editor";
import { SectionVisibility } from "./section-visibility";
import { SkillsEditor } from "./skills-editor";

interface ResumeEditorPanelProps {
  resumeData: ResumeData;
  onResumeUpdate: (data: ResumeData) => void;
}

export function ResumeEditorPanel({
  resumeData,
  onResumeUpdate,
}: ResumeEditorPanelProps) {
  const layoutPreferences = resumeData.layoutPreferences ?? {
    experienceOrder: "title-first",
    educationOrder: "degree-first",
    sectionOrder: ["summary", "experience", "projects", "education", "skills"],
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-4">
        <h2 className="text-sm font-medium text-foreground">Resume Editor</h2>
      </div>

      <Tabs defaultValue="info" className="flex flex-1 flex-col overflow-hidden">
        <div className="border-b border-border px-2">
          <TabsList className="h-10 w-full justify-start gap-1 bg-transparent p-0">
            <TabsTrigger
              value="info"
              className="h-8 rounded-none border-b-2 border-transparent px-3 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              Info
            </TabsTrigger>
            <TabsTrigger
              value="work"
              className="h-8 rounded-none border-b-2 border-transparent px-3 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              Work
            </TabsTrigger>
            <TabsTrigger
              value="projects"
              className="h-8 rounded-none border-b-2 border-transparent px-3 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              Projects
            </TabsTrigger>
            <TabsTrigger
              value="education"
              className="h-8 rounded-none border-b-2 border-transparent px-3 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              Edu
            </TabsTrigger>
            <TabsTrigger
              value="skills"
              className="h-8 rounded-none border-b-2 border-transparent px-3 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              Skills
            </TabsTrigger>
            <TabsTrigger
              value="cover"
              className="h-8 rounded-none border-b-2 border-transparent px-3 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              Cover
            </TabsTrigger>
          </TabsList>
        </div>

        <ScrollArea className="flex-1">
          <TabsContent value="info" className="m-0 p-4">
            <div className="space-y-4">
              <PageSettings
                settings={resumeData.pageSettings}
                onChange={(pageSettings) =>
                  onResumeUpdate({ ...resumeData, pageSettings })
                }
              />
          <SectionVisibility
            visibility={resumeData.sectionVisibility}
            order={layoutPreferences.sectionOrder}
            onOrderChange={(sectionOrder) =>
              onResumeUpdate({
                ...resumeData,
                layoutPreferences: {
                  ...layoutPreferences,
                  sectionOrder,
                },
              })
            }
            onChange={(sectionVisibility) =>
              onResumeUpdate({ ...resumeData, sectionVisibility })
            }
          />
              <MetadataEditor
                metadata={resumeData.metadata}
                onChange={(metadata) =>
                  onResumeUpdate({ ...resumeData, metadata })
                }
              />
            </div>
          </TabsContent>

          <TabsContent value="work" className="m-0 p-4">
            <ExperienceEditor
              experience={resumeData.experience}
              order={layoutPreferences.experienceOrder}
              onOrderChange={(experienceOrder) =>
                onResumeUpdate({
                  ...resumeData,
                  layoutPreferences: {
                    ...layoutPreferences,
                    experienceOrder,
                  },
                })
              }
              onChange={(experience) =>
                onResumeUpdate({ ...resumeData, experience })
              }
            />
          </TabsContent>

          <TabsContent value="projects" className="m-0 p-4">
            <ProjectsEditor
              projects={resumeData.projects}
              onChange={(projects) =>
                onResumeUpdate({ ...resumeData, projects })
              }
            />
          </TabsContent>

          <TabsContent value="education" className="m-0 p-4">
            <EducationEditor
              education={resumeData.education}
              order={layoutPreferences.educationOrder}
              onOrderChange={(educationOrder) =>
                onResumeUpdate({
                  ...resumeData,
                  layoutPreferences: {
                    ...layoutPreferences,
                    educationOrder,
                  },
                })
              }
              onChange={(education) =>
                onResumeUpdate({ ...resumeData, education })
              }
            />
          </TabsContent>

          <TabsContent value="skills" className="m-0 p-4">
            <SkillsEditor
              skills={resumeData.skills}
              onChange={(skills) => onResumeUpdate({ ...resumeData, skills })}
            />
          </TabsContent>

          <TabsContent value="cover" className="m-0 p-4">
            <CoverLetterEditor
              coverLetter={resumeData.coverLetter}
              onChange={(coverLetter) =>
                onResumeUpdate({ ...resumeData, coverLetter })
              }
            />
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
}
