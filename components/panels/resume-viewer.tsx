"use client";

import { useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PAPER_DIMENSIONS } from "@/lib/resume-defaults";
import type { ResumeData, SkillEntry } from "@/types";

interface ResumeViewerProps {
  resumeData: ResumeData;
}

export function ResumeViewer({ resumeData }: ResumeViewerProps) {
  const { pageSettings, metadata, sectionVisibility, coverLetter, experience, projects, education, skills } = resumeData;

  const paperStyle = useMemo(() => {
    const { width, height } = PAPER_DIMENSIONS[pageSettings.paperSize];
    const { margins } = pageSettings;

    // Calculate margin percentages relative to paper width for responsive scaling
    const marginTopPercent = (margins.top / height) * 100;
    const marginRightPercent = (margins.right / width) * 100;
    const marginBottomPercent = (margins.bottom / height) * 100;
    const marginLeftPercent = (margins.left / width) * 100;

    return {
      aspectRatio: `${width} / ${height}`,
      padding: `${marginTopPercent}% ${marginRightPercent}% ${marginBottomPercent}% ${marginLeftPercent}%`,
    };
  }, [pageSettings]);

  // Group skills by category
  const skillsByCategory = useMemo(() => {
    return skills.reduce<Record<string, SkillEntry[]>>((acc, skill) => {
      const category = skill.category || "Other";
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(skill);
      return acc;
    }, {});
  }, [skills]);

  // Build contact info string
  const contactParts = useMemo(() => {
    const parts: string[] = [];
    if (metadata.contactInfo.email) parts.push(metadata.contactInfo.email);
    if (metadata.contactInfo.phone) parts.push(metadata.contactInfo.phone);
    if (metadata.contactInfo.location) parts.push(metadata.contactInfo.location);
    return parts;
  }, [metadata.contactInfo]);

  const todayFormatted = useMemo(
    () =>
      new Date().toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    []
  );

  const hasExperience = experience.length > 0;
  const hasProjects = projects.length > 0;
  const hasEducation = education.length > 0;
  const hasSkills = skills.length > 0;

  return (
    <div className="flex h-full flex-col">
      <Tabs defaultValue="resume" className="flex h-full flex-col">
        <div className="border-b border-border px-4">
          <TabsList className="h-12 w-full justify-start gap-4 bg-transparent p-0">
            <TabsTrigger
              value="resume"
              className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none px-0 pb-3 pt-3"
            >
              Resume
            </TabsTrigger>
            <TabsTrigger
              value="cover-letter"
              className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none px-0 pb-3 pt-3"
            >
              Cover Letter
            </TabsTrigger>
          </TabsList>
        </div>

        <ScrollArea className="flex-1">
          <div className="flex justify-center p-8">
            <TabsContent value="resume" className="mt-0 w-full max-w-[612px]">
              <div className="document-paper rounded-sm" style={paperStyle}>
                <div className="space-y-4">
                  {/* Header */}
                  <div className="text-center">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                      {metadata.fullName || "Your Name"}
                    </h1>
                    {metadata.subtitle && (
                      <p className="mt-0.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                        {metadata.subtitle}
                      </p>
                    )}
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                      {contactParts.length > 0
                        ? contactParts.join(" | ")
                        : "email@example.com | (555) 123-4567 | City, State"}
                    </p>
                  </div>

                  {/* Summary */}
                  {sectionVisibility.summary && (
                    <div>
                      <h2 className="border-b border-gray-300 pb-1 text-sm font-bold uppercase tracking-wide text-gray-900 dark:text-gray-100 dark:border-gray-700">
                        Summary
                      </h2>
                      <p className="mt-2 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                        {metadata.summary ||
                          "Your professional summary will appear here..."}
                      </p>
                    </div>
                  )}

                  {/* Experience */}
                  {sectionVisibility.experience && hasExperience && (
                    <div>
                      <h2 className="border-b border-gray-300 pb-1 text-sm font-bold uppercase tracking-wide text-gray-900 dark:text-gray-100 dark:border-gray-700">
                        Experience
                      </h2>
                      <div className="mt-2 space-y-3">
                        {experience.map((entry) => (
                          <div key={entry.id}>
                            <div className="flex justify-between">
                              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                {entry.jobTitle || "Job Title"}
                              </span>
                              <span className="text-sm text-gray-600 dark:text-gray-400">
                                {entry.startDate || "Start"} - {entry.endDate || "Present"}
                              </span>
                            </div>
                            <p className="text-sm text-gray-700 dark:text-gray-300">
                              {entry.company || "Company Name"}
                              {entry.location && ` | ${entry.location}`}
                            </p>
                            {entry.bullets.length > 0 && (
                              <ul className="mt-1 list-inside list-disc text-sm text-gray-600 dark:text-gray-400">
                                {entry.bullets.map((bullet, idx) => (
                                  <li key={idx}>{bullet}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Projects */}
                  {sectionVisibility.projects && hasProjects && (
                    <div>
                      <h2 className="border-b border-gray-300 pb-1 text-sm font-bold uppercase tracking-wide text-gray-900 dark:text-gray-100 dark:border-gray-700">
                        Projects
                      </h2>
                      <div className="mt-2 space-y-3">
                        {projects.map((project) => (
                          <div key={project.id}>
                            <div className="flex justify-between items-baseline">
                              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                {project.name || "Project Name"}
                              </span>
                              {project.technologies.length > 0 && (
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  {project.technologies.join(", ")}
                                </span>
                              )}
                            </div>
                            {project.description && (
                              <p className="text-sm text-gray-700 dark:text-gray-300">
                                {project.description}
                              </p>
                            )}
                            {project.bullets.length > 0 && (
                              <ul className="mt-1 list-inside list-disc text-sm text-gray-600 dark:text-gray-400">
                                {project.bullets.map((bullet, idx) => (
                                  <li key={idx}>{bullet}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Education */}
                  {sectionVisibility.education && hasEducation && (
                    <div>
                      <h2 className="border-b border-gray-300 pb-1 text-sm font-bold uppercase tracking-wide text-gray-900 dark:text-gray-100 dark:border-gray-700">
                        Education
                      </h2>
                      <div className="mt-2 space-y-3">
                        {education.map((entry) => (
                          <div key={entry.id}>
                            <div className="flex justify-between">
                              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                {entry.institution || "Institution"}
                              </span>
                              <span className="text-sm text-gray-600 dark:text-gray-400">
                                {entry.graduationDate || "Graduation Date"}
                              </span>
                            </div>
                            <p className="text-sm text-gray-700 dark:text-gray-300">
                              {entry.degree || "Degree"}
                              {entry.field && ` in ${entry.field}`}
                              {entry.gpa && ` | GPA: ${entry.gpa}`}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Skills */}
                  {sectionVisibility.skills && hasSkills && (
                    <div>
                      <h2 className="border-b border-gray-300 pb-1 text-sm font-bold uppercase tracking-wide text-gray-900 dark:text-gray-100 dark:border-gray-700">
                        Skills
                      </h2>
                      <div className="mt-2 space-y-1">
                        {Object.entries(skillsByCategory).map(([category, categorySkills]) => (
                          <p key={category} className="text-sm text-gray-700 dark:text-gray-300">
                            <span className="font-semibold">{category}:</span>{" "}
                            {categorySkills.map((s) => s.name).join(", ")}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Empty state for Experience when no entries */}
                  {sectionVisibility.experience && !hasExperience && (
                    <div>
                      <h2 className="border-b border-gray-300 pb-1 text-sm font-bold uppercase tracking-wide text-gray-900 dark:text-gray-100 dark:border-gray-700">
                        Experience
                      </h2>
                      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 italic">
                        Add experience entries in the editor panel...
                      </p>
                    </div>
                  )}

                  {/* Empty state for Skills when no entries */}
                  {sectionVisibility.skills && !hasSkills && (
                    <div>
                      <h2 className="border-b border-gray-300 pb-1 text-sm font-bold uppercase tracking-wide text-gray-900 dark:text-gray-100 dark:border-gray-700">
                        Skills
                      </h2>
                      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 italic">
                        Add skills in the editor panel...
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent
              value="cover-letter"
              className="mt-0 w-full max-w-[612px]"
            >
              <div className="document-paper rounded-sm" style={paperStyle}>
                <div className="space-y-6">
                  {/* Sender */}
                  <div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      {metadata.fullName || "Your Name"}
                      <br />
                      {metadata.contactInfo.location || "Your Address"}
                      <br />
                      {metadata.contactInfo.email || "email@example.com"}
                    </p>
                  </div>

                  {/* Date */}
                  <div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      {coverLetter.date || todayFormatted}
                    </p>
                  </div>

                  {/* Recipient */}
                  <div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      {coverLetter.hiringManager || "Hiring Manager"}
                      {coverLetter.companyAddress && (
                        <>
                          <br />
                          <span className="whitespace-pre-line">
                            {coverLetter.companyAddress}
                          </span>
                        </>
                      )}
                      {!coverLetter.companyAddress && (
                        <>
                          <br />
                          Company Name
                          <br />
                          Company Address
                          <br />
                          City, State ZIP
                        </>
                      )}
                    </p>
                  </div>

                  {/* Greeting + body + sign-off */}
                  <div className="space-y-4">
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      Dear {coverLetter.hiringManager || "Hiring Manager"},
                    </p>
                    <p className="whitespace-pre-line text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                      {coverLetter.body ||
                        "Your cover letter content will appear here. Use the Cover tab in the editor to write your letter."}
                    </p>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      {coverLetter.sendoff || "Best Regards,"}
                      <br />
                      <br />
                      {metadata.fullName || "Your Name"}
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>
    </div>
  );
}
