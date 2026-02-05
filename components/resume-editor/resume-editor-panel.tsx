"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DEFAULT_LAYOUT_PREFERENCES } from "@/lib/resume-defaults";
import type { ResumeData } from "@/types";
import { CoverLetterEditor } from "./cover-letter-editor";
import { EducationEditor } from "./education-editor";
import { ExperienceEditor } from "./experience-editor";
import { FontSettings } from "./font-settings";
import { HeaderAlignmentEditor } from "./header-alignment-editor";
import { MetadataEditor } from "./metadata-editor";
import { PageSettings } from "./page-settings";
import { ProjectsEditor } from "./projects-editor";
import { ResumeImportPanel } from "./resume-import";
import { SectionVisibility } from "./section-visibility";
import { SectionAiHeader } from "./section-ai-header";
import { SkillsEditor } from "./skills-editor";

interface ResumeEditorPanelProps {
  resumeData: ResumeData;
  onResumeUpdate: (data: ResumeData) => void;
  onImportResume: (file: File) => Promise<void>;
  isImportingResume: boolean;
  importError?: string | null;
}

export function ResumeEditorPanel({
  resumeData,
  onResumeUpdate,
  onImportResume,
  isImportingResume,
  importError,
}: ResumeEditorPanelProps) {
  const layoutPreferences = {
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
  };

  return (
    <div className="flex h-full flex-col">
      <Tabs defaultValue="info" className="flex flex-1 flex-col overflow-hidden">
        <div className="flex h-[52px] items-center border-b border-border px-4">
          <TabsList className="grid h-full w-full grid-cols-7 bg-transparent p-0">
            <TabsTrigger
              value="layout"
              className="h-full rounded-none border-b-2 border-transparent px-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              Layout
            </TabsTrigger>
            <TabsTrigger
              value="info"
              className="h-full rounded-none border-b-2 border-transparent px-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              Info
            </TabsTrigger>
            <TabsTrigger
              value="work"
              className="h-full rounded-none border-b-2 border-transparent px-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              Work
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
              Edu
            </TabsTrigger>
            <TabsTrigger
              value="skills"
              className="h-full rounded-none border-b-2 border-transparent px-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              Skills
            </TabsTrigger>
            <TabsTrigger
              value="cover"
              className="h-full rounded-none border-b-2 border-transparent px-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              Cover
            </TabsTrigger>
          </TabsList>
        </div>

        <ScrollArea className="flex-1">
          <TabsContent value="info" className="m-0 p-4">
            <div className="space-y-4">
              <ResumeImportPanel
                onImport={onImportResume}
                isImporting={isImportingResume}
                error={importError}
              />
              <MetadataEditor
                metadata={resumeData.metadata}
                contactOrder={layoutPreferences.contactOrder}
                onChange={(metadata) =>
                  onResumeUpdate({ ...resumeData, metadata })
                }
                onContactOrderChange={(contactOrder) =>
                  onResumeUpdate({
                    ...resumeData,
                    layoutPreferences: {
                      ...layoutPreferences,
                      contactOrder,
                    },
                  })
                }
              />
            </div>
          </TabsContent>

          <TabsContent value="layout" className="m-0 p-4">
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
              <HeaderAlignmentEditor
                alignment={layoutPreferences.headerAlignment}
                onChange={(headerAlignment) =>
                  onResumeUpdate({
                    ...resumeData,
                    layoutPreferences: {
                      ...layoutPreferences,
                      headerAlignment,
                    },
                  })
                }
              />
              <FontSettings
                resumePreferences={layoutPreferences.fontPreferences}
                coverLetterPreferences={layoutPreferences.coverLetterFontPreferences}
                onResumeChange={(fontPreferences) =>
                  onResumeUpdate({
                    ...resumeData,
                    layoutPreferences: {
                      ...layoutPreferences,
                      fontPreferences,
                    },
                  })
                }
                onCoverLetterChange={(coverLetterFontPreferences) =>
                  onResumeUpdate({
                    ...resumeData,
                    layoutPreferences: {
                      ...layoutPreferences,
                      coverLetterFontPreferences,
                    },
                  })
                }
              />
            </div>
          </TabsContent>

          <TabsContent value="work" className="m-0 p-4">
            <div className="space-y-4">
              <SectionAiHeader title="Experience" section="experience" />
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
            </div>
          </TabsContent>

          <TabsContent value="projects" className="m-0 p-4">
            <div className="space-y-4">
              <SectionAiHeader title="Projects" section="projects" />
              <ProjectsEditor
                projects={resumeData.projects}
                onChange={(projects) =>
                  onResumeUpdate({ ...resumeData, projects })
                }
              />
            </div>
          </TabsContent>

          <TabsContent value="education" className="m-0 p-4">
            <div className="space-y-4">
              <SectionAiHeader title="Education" section="education" />
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
            </div>
          </TabsContent>

          <TabsContent value="skills" className="m-0 p-4">
            <div className="space-y-4">
              <SectionAiHeader title="Skills" section="skills" />
              <SkillsEditor
                skills={resumeData.skills}
                onChange={(skills) => onResumeUpdate({ ...resumeData, skills })}
              />
            </div>
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
