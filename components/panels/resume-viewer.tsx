"use client";

import { Fragment, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PAPER_DIMENSIONS } from "@/lib/resume-defaults";
import type { ResumeData, SectionKey, SkillEntry } from "@/types";

interface ResumeViewerProps {
  resumeData: ResumeData;
}

export function ResumeViewer({ resumeData }: ResumeViewerProps) {
  const {
    pageSettings,
    metadata,
    sectionVisibility,
    layoutPreferences,
    coverLetter,
    experience,
    projects,
    education,
    skills,
  } = resumeData;

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

  const { groupedSkills, ungroupedSkills } = useMemo(() => {
    const grouped: Record<string, SkillEntry[]> = {};
    const ungrouped: SkillEntry[] = [];

    skills.forEach((skill) => {
      const name = skill.name.trim();
      const category = (skill.category || "").trim();
      if (!name) return;

      if (category) {
        if (!grouped[category]) {
          grouped[category] = [];
        }
        grouped[category].push({ ...skill, name, category });
      } else {
        ungrouped.push({ ...skill, name, category: "" });
      }
    });

    return { groupedSkills: grouped, ungroupedSkills: ungrouped };
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
  const experienceOrder = layoutPreferences?.experienceOrder ?? "title-first";
  const educationOrder = layoutPreferences?.educationOrder ?? "degree-first";
  const orderedSections = useMemo(() => {
    const fallback: SectionKey[] = [
      "summary",
      "experience",
      "projects",
      "education",
      "skills",
    ];
    const preferred = layoutPreferences?.sectionOrder ?? fallback;
    const seen = new Set<SectionKey>();
    return [...preferred, ...fallback].filter((section) => {
      if (seen.has(section)) return false;
      seen.add(section);
      return true;
    });
  }, [layoutPreferences?.sectionOrder]);

  const renderSummary = () => {
    if (!sectionVisibility.summary) return null;
    return (
      <div>
        <h2 className="border-b border-gray-300 pb-1 text-sm font-bold uppercase tracking-wide text-gray-900 dark:text-gray-100 dark:border-gray-700">
          Summary
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
          {metadata.summary ||
            "Your professional summary will appear here..."}
        </p>
      </div>
    );
  };

  const renderExperience = () => {
    if (!sectionVisibility.experience) return null;
    if (hasExperience) {
      return (
        <div>
          <h2 className="border-b border-gray-300 pb-1 text-sm font-bold uppercase tracking-wide text-gray-900 dark:text-gray-100 dark:border-gray-700">
            Experience
          </h2>
          <div className="mt-2 space-y-3">
            {experience.map((entry) => {
              const primary =
                experienceOrder === "title-first"
                  ? entry.jobTitle
                  : entry.company;
              const secondary =
                experienceOrder === "title-first"
                  ? entry.company
                  : entry.jobTitle;
              const secondaryLine = [secondary, entry.location]
                .filter(Boolean)
                .join(" | ");
              const primaryFallback =
                experienceOrder === "title-first"
                  ? "Job Title"
                  : "Company Name";
              const secondaryFallback =
                experienceOrder === "title-first"
                  ? "Company Name"
                  : "Job Title";

              return (
                <div key={entry.id}>
                  <div className="flex justify-between">
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {primary || primaryFallback}
                    </span>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {entry.startDate || "Start"} - {entry.endDate || "Present"}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {secondaryLine || secondaryFallback}
                  </p>
                  {entry.bullets.length > 0 && (
                    <ul className="mt-1 list-inside list-disc text-sm text-gray-600 dark:text-gray-400">
                      {entry.bullets.map((bullet, idx) => (
                        <li key={idx}>{bullet}</li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <div>
        <h2 className="border-b border-gray-300 pb-1 text-sm font-bold uppercase tracking-wide text-gray-900 dark:text-gray-100 dark:border-gray-700">
          Experience
        </h2>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 italic">
          Add experience entries in the editor panel...
        </p>
      </div>
    );
  };

  const renderProjects = () => {
    if (!sectionVisibility.projects || !hasProjects) return null;
    return (
      <div>
        <h2 className="border-b border-gray-300 pb-1 text-sm font-bold uppercase tracking-wide text-gray-900 dark:text-gray-100 dark:border-gray-700">
          Projects
        </h2>
        <div className="mt-2 space-y-3">
          {projects.map((project) => {
            const projectBullets = project.bullets
              .map((bullet) => bullet.trim())
              .filter(Boolean);

            return (
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
                {projectBullets.length > 0 && (
                  <ul className="mt-1 list-inside list-disc text-sm text-gray-600 dark:text-gray-400">
                    {projectBullets.map((bullet, idx) => (
                      <li key={idx}>{bullet}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderEducation = () => {
    if (!sectionVisibility.education || !hasEducation) return null;
    return (
      <div>
        <h2 className="border-b border-gray-300 pb-1 text-sm font-bold uppercase tracking-wide text-gray-900 dark:text-gray-100 dark:border-gray-700">
          Education
        </h2>
        <div className="mt-2 space-y-3">
          {education.map((entry) => {
            const primary =
              educationOrder === "degree-first"
                ? entry.degree
                : entry.institution;
            const secondary =
              educationOrder === "degree-first"
                ? entry.institution
                : entry.degree;
            const secondaryLine = [
              secondary,
              entry.location,
              entry.gpa ? `GPA: ${entry.gpa}` : "",
            ]
              .filter(Boolean)
              .join(" | ");
            const primaryFallback =
              educationOrder === "degree-first"
                ? "Degree"
                : "University Name";
            const secondaryFallback =
              educationOrder === "degree-first"
                ? "University Name"
                : "Degree";

            return (
              <div key={entry.id}>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {primary || primaryFallback}
                </p>
                {(secondaryLine || secondaryFallback) && (
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {secondaryLine || secondaryFallback}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderSkills = () => {
    if (!sectionVisibility.skills) return null;
    if (hasSkills) {
      return (
        <div>
          <h2 className="border-b border-gray-300 pb-1 text-sm font-bold uppercase tracking-wide text-gray-900 dark:text-gray-100 dark:border-gray-700">
            Skills
          </h2>
          <div className="mt-2 space-y-1">
            {Object.entries(groupedSkills).map(
              ([category, categorySkills]) => (
                <p
                  key={category}
                  className="text-sm text-gray-700 dark:text-gray-300"
                >
                  <span className="font-semibold">{category}:</span>{" "}
                  {categorySkills.map((s) => s.name).join(", ")}
                </p>
              )
            )}
            {ungroupedSkills.length > 0 && (
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {ungroupedSkills.map((s) => s.name).join(", ")}
              </p>
            )}
          </div>
        </div>
      );
    }

    return (
      <div>
        <h2 className="border-b border-gray-300 pb-1 text-sm font-bold uppercase tracking-wide text-gray-900 dark:text-gray-100 dark:border-gray-700">
          Skills
        </h2>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 italic">
          Add skills in the editor panel...
        </p>
      </div>
    );
  };

  const sectionRenderers: Record<SectionKey, () => JSX.Element | null> = {
    summary: renderSummary,
    experience: renderExperience,
    projects: renderProjects,
    education: renderEducation,
    skills: renderSkills,
  };

  return (
    <div className="flex h-full flex-col">
      <Tabs defaultValue="resume" className="flex h-full flex-col">
        <div className="flex h-[52px] items-center border-b border-border px-4">
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

                  {orderedSections.map((section) => {
                    const content = sectionRenderers[section]();
                    return content ? (
                      <Fragment key={section}>{content}</Fragment>
                    ) : null;
                  })}
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
