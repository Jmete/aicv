"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ClipboardEvent, KeyboardEvent } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { PAPER_DIMENSIONS } from "@/lib/resume-defaults";
import { cn } from "@/lib/utils";
import type { ResumeData, SectionKey, SkillEntry } from "@/types";
import { Plus, Trash2 } from "lucide-react";

interface ResumeViewerProps {
  resumeData: ResumeData;
  onResumeUpdate: (data: ResumeData) => void;
}

interface EditableTextProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  multiline?: boolean;
}

const normalizeText = (value: string, multiline: boolean) => {
  const normalized = value.replace(/\u00a0/g, " ");
  return multiline ? normalized : normalized.replace(/\n+/g, " ");
};

function EditableText({
  value,
  onChange,
  placeholder = "",
  className,
  multiline = false,
}: EditableTextProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const normalizedValue = normalizeText(value, multiline);

  useEffect(() => {
    if (!ref.current || isEditing) return;
    if (ref.current.textContent !== normalizedValue) {
      ref.current.textContent = normalizedValue;
    }
  }, [normalizedValue, isEditing]);

  const commit = () => {
    if (!ref.current) return;
    const nextValue = normalizeText(ref.current.textContent ?? "", multiline);
    if (nextValue !== value) {
      onChange(nextValue);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (!multiline && event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLSpanElement>) => {
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, normalizeText(text, multiline));
  };

  return (
    <span
      ref={ref}
      className={cn(
        "editable-field",
        multiline ? "block whitespace-pre-line" : "inline-block",
        className
      )}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onInput={commit}
      onBlur={() => {
        setIsEditing(false);
        commit();
      }}
      onFocus={() => setIsEditing(true)}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      role="textbox"
      aria-label={placeholder || "Editable text"}
      tabIndex={0}
      spellCheck
    />
  );
}

export function ResumeViewer({
  resumeData,
  onResumeUpdate,
}: ResumeViewerProps) {
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

  const updateMetadata = (updates: Partial<ResumeData["metadata"]>) => {
    onResumeUpdate({
      ...resumeData,
      metadata: {
        ...metadata,
        ...updates,
      },
    });
  };

  const updateContactInfo = (
    updates: Partial<ResumeData["metadata"]["contactInfo"]>
  ) => {
    updateMetadata({
      contactInfo: {
        ...metadata.contactInfo,
        ...updates,
      },
    });
  };

  const updateExperienceEntry = (
    entryId: string,
    updates: Partial<ResumeData["experience"][number]>
  ) => {
    onResumeUpdate({
      ...resumeData,
      experience: experience.map((entry) =>
        entry.id === entryId ? { ...entry, ...updates } : entry
      ),
    });
  };

  const updateExperienceBullet = (
    entryId: string,
    bulletIndex: number,
    value: string
  ) => {
    const entry = experience.find((item) => item.id === entryId);
    if (!entry) return;
    const nextBullets = [...entry.bullets];
    nextBullets[bulletIndex] = value;
    updateExperienceEntry(entryId, { bullets: nextBullets });
  };

  const updateProjectEntry = (
    projectId: string,
    updates: Partial<ResumeData["projects"][number]>
  ) => {
    onResumeUpdate({
      ...resumeData,
      projects: projects.map((project) =>
        project.id === projectId ? { ...project, ...updates } : project
      ),
    });
  };

  const updateProjectBullet = (
    projectId: string,
    bulletIndex: number,
    value: string
  ) => {
    const project = projects.find((item) => item.id === projectId);
    if (!project) return;
    const nextBullets = [...project.bullets];
    nextBullets[bulletIndex] = value;
    updateProjectEntry(projectId, { bullets: nextBullets });
  };

  const updateEducationEntry = (
    entryId: string,
    updates: Partial<ResumeData["education"][number]>
  ) => {
    onResumeUpdate({
      ...resumeData,
      education: education.map((entry) =>
        entry.id === entryId ? { ...entry, ...updates } : entry
      ),
    });
  };

  const updateSkill = (
    skillId: string,
    updates: Partial<ResumeData["skills"][number]>
  ) => {
    onResumeUpdate({
      ...resumeData,
      skills: skills.map((skill) =>
        skill.id === skillId ? { ...skill, ...updates } : skill
      ),
    });
  };

  const updateSkillCategory = (currentCategory: string, nextCategory: string) => {
    const normalized = currentCategory.trim();
    onResumeUpdate({
      ...resumeData,
      skills: skills.map((skill) =>
        skill.category.trim() === normalized
          ? { ...skill, category: nextCategory }
          : skill
      ),
    });
  };

  const updateCoverLetter = (updates: Partial<ResumeData["coverLetter"]>) => {
    onResumeUpdate({
      ...resumeData,
      coverLetter: {
        ...coverLetter,
        ...updates,
      },
    });
  };

  const parseCommaList = (value: string) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

  const addExperienceEntry = () => {
    const newEntry: ResumeData["experience"][number] = {
      id: crypto.randomUUID(),
      company: "",
      jobTitle: "",
      location: "",
      startDate: "",
      endDate: "",
      bullets: [],
    };
    onResumeUpdate({ ...resumeData, experience: [...experience, newEntry] });
  };

  const removeExperienceEntry = (entryId: string) => {
    onResumeUpdate({
      ...resumeData,
      experience: experience.filter((entry) => entry.id !== entryId),
    });
  };

  const addExperienceBullet = (entryId: string) => {
    const entry = experience.find((item) => item.id === entryId);
    if (!entry) return;
    updateExperienceEntry(entryId, { bullets: [...entry.bullets, ""] });
  };

  const removeExperienceBullet = (entryId: string, bulletIndex: number) => {
    const entry = experience.find((item) => item.id === entryId);
    if (!entry) return;
    const nextBullets = entry.bullets.filter((_, idx) => idx !== bulletIndex);
    updateExperienceEntry(entryId, { bullets: nextBullets });
  };

  const addProjectEntry = () => {
    const newEntry: ResumeData["projects"][number] = {
      id: crypto.randomUUID(),
      name: "",
      description: "",
      technologies: [],
      bullets: [],
    };
    onResumeUpdate({ ...resumeData, projects: [...projects, newEntry] });
  };

  const removeProjectEntry = (projectId: string) => {
    onResumeUpdate({
      ...resumeData,
      projects: projects.filter((project) => project.id !== projectId),
    });
  };

  const addProjectBullet = (projectId: string) => {
    const project = projects.find((item) => item.id === projectId);
    if (!project) return;
    updateProjectEntry(projectId, { bullets: [...project.bullets, ""] });
  };

  const removeProjectBullet = (projectId: string, bulletIndex: number) => {
    const project = projects.find((item) => item.id === projectId);
    if (!project) return;
    const nextBullets = project.bullets.filter((_, idx) => idx !== bulletIndex);
    updateProjectEntry(projectId, { bullets: nextBullets });
  };

  const addEducationEntry = () => {
    const newEntry: ResumeData["education"][number] = {
      id: crypto.randomUUID(),
      degree: "",
      institution: "",
      location: "",
      field: "",
      graduationDate: "",
      gpa: "",
    };
    onResumeUpdate({ ...resumeData, education: [...education, newEntry] });
  };

  const removeEducationEntry = (entryId: string) => {
    onResumeUpdate({
      ...resumeData,
      education: education.filter((entry) => entry.id !== entryId),
    });
  };

  const addSkill = (category = "") => {
    const newSkill: ResumeData["skills"][number] = {
      id: crypto.randomUUID(),
      name: "",
      category,
    };
    onResumeUpdate({ ...resumeData, skills: [...skills, newSkill] });
  };

  const removeSkill = (skillId: string) => {
    onResumeUpdate({
      ...resumeData,
      skills: skills.filter((skill) => skill.id !== skillId),
    });
  };

  const renderSummary = () => {
    if (!sectionVisibility.summary) return null;
    return (
      <div>
        <h2 className="border-b border-gray-300 pb-1 text-sm font-bold uppercase tracking-wide text-gray-900 dark:text-gray-100 dark:border-gray-700">
          Summary
        </h2>
        <EditableText
          value={metadata.summary}
          onChange={(summary) => updateMetadata({ summary })}
          placeholder="Your professional summary will appear here..."
          className="mt-2 text-sm leading-relaxed text-gray-700 dark:text-gray-300"
          multiline
        />
      </div>
    );
  };

  const renderExperience = () => {
    if (!sectionVisibility.experience) return null;
    return (
      <div>
        <div className="flex items-center justify-between border-b border-gray-300 pb-1 text-gray-900 dark:text-gray-100 dark:border-gray-700">
          <h2 className="text-sm font-bold uppercase tracking-wide">
            Experience
          </h2>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={addExperienceEntry}
          >
            <Plus className="h-3 w-3" />
            Add Experience
          </Button>
        </div>
        {hasExperience ? (
          <div className="mt-2 space-y-3">
            {experience.map((entry) => {
              const primaryField =
                experienceOrder === "title-first" ? "jobTitle" : "company";
              const secondaryField =
                experienceOrder === "title-first" ? "company" : "jobTitle";
              const primaryFallback =
                experienceOrder === "title-first" ? "Job Title" : "Company Name";
              const secondaryFallback =
                experienceOrder === "title-first" ? "Company Name" : "Job Title";

              return (
                <div key={entry.id} className="group space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      <EditableText
                        value={entry[primaryField]}
                        onChange={(value) =>
                          updateExperienceEntry(entry.id, {
                            [primaryField]: value,
                          } as Partial<ResumeData["experience"][number]>)
                        }
                        placeholder={primaryFallback}
                      />
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        <EditableText
                          value={entry.startDate}
                          onChange={(value) =>
                            updateExperienceEntry(entry.id, {
                              startDate: value,
                            })
                          }
                          placeholder="Start"
                        />
                        <span className="mx-1">-</span>
                        <EditableText
                          value={entry.endDate}
                          onChange={(value) =>
                            updateExperienceEntry(entry.id, { endDate: value })
                          }
                          placeholder="Present"
                        />
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-destructive"
                        onClick={() => removeExperienceEntry(entry.id)}
                        aria-label="Remove experience"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    <EditableText
                      value={entry[secondaryField]}
                      onChange={(value) =>
                        updateExperienceEntry(entry.id, {
                          [secondaryField]: value,
                        } as Partial<ResumeData["experience"][number]>)
                      }
                      placeholder={secondaryFallback}
                    />
                    <span className="text-gray-400"> | </span>
                    <EditableText
                      value={entry.location}
                      onChange={(value) =>
                        updateExperienceEntry(entry.id, { location: value })
                      }
                      placeholder="Location"
                    />
                  </p>
                  {entry.bullets.length > 0 && (
                    <ul className="mt-1 list-inside list-disc text-sm text-gray-600 dark:text-gray-400">
                      {entry.bullets.map((bullet, idx) => (
                        <li key={idx} className="group/bullet">
                          <EditableText
                            value={bullet}
                            onChange={(value) =>
                              updateExperienceBullet(entry.id, idx, value)
                            }
                            placeholder="Describe your accomplishment..."
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="ml-1 h-4 w-4 text-muted-foreground opacity-0 transition group-hover/bullet:opacity-100 hover:text-destructive"
                            onClick={() =>
                              removeExperienceBullet(entry.id, idx)
                            }
                            aria-label="Remove bullet"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                    onClick={() => addExperienceBullet(entry.id)}
                  >
                    <Plus className="h-3 w-3" />
                    Add Bullet
                  </Button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 italic">
            Add experience entries using the button above.
          </p>
        )}
      </div>
    );
  };

  const renderProjects = () => {
    if (!sectionVisibility.projects || !hasProjects) {
      return sectionVisibility.projects ? (
        <div>
          <div className="flex items-center justify-between border-b border-gray-300 pb-1 text-gray-900 dark:text-gray-100 dark:border-gray-700">
            <h2 className="text-sm font-bold uppercase tracking-wide">Projects</h2>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={addProjectEntry}
            >
              <Plus className="h-3 w-3" />
              Add Project
            </Button>
          </div>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 italic">
            Add project entries using the button above.
          </p>
        </div>
      ) : null;
    }

    return (
      <div>
        <div className="flex items-center justify-between border-b border-gray-300 pb-1 text-gray-900 dark:text-gray-100 dark:border-gray-700">
          <h2 className="text-sm font-bold uppercase tracking-wide">Projects</h2>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={addProjectEntry}
          >
            <Plus className="h-3 w-3" />
            Add Project
          </Button>
        </div>
        <div className="mt-2 space-y-3">
          {projects.map((project) => (
            <div key={project.id} className="group space-y-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  <EditableText
                    value={project.name}
                    onChange={(value) =>
                      updateProjectEntry(project.id, { name: value })
                    }
                    placeholder="Project Name"
                  />
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    <EditableText
                      value={project.technologies.join(", ")}
                      onChange={(value) =>
                        updateProjectEntry(project.id, {
                          technologies: parseCommaList(value),
                        })
                      }
                      placeholder="Technologies"
                    />
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-destructive"
                    onClick={() => removeProjectEntry(project.id)}
                    aria-label="Remove project"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <EditableText
                value={project.description}
                onChange={(value) =>
                  updateProjectEntry(project.id, { description: value })
                }
                placeholder="Project description"
                className="text-sm text-gray-700 dark:text-gray-300"
                multiline
              />
              {project.bullets.length > 0 && (
                <ul className="mt-1 list-inside list-disc text-sm text-gray-600 dark:text-gray-400">
                  {project.bullets.map((bullet, idx) => (
                    <li key={idx} className="group/bullet">
                      <EditableText
                        value={bullet}
                        onChange={(value) =>
                          updateProjectBullet(project.id, idx, value)
                        }
                        placeholder="Project impact..."
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="ml-1 h-4 w-4 text-muted-foreground opacity-0 transition group-hover/bullet:opacity-100 hover:text-destructive"
                        onClick={() => removeProjectBullet(project.id, idx)}
                        aria-label="Remove bullet"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                onClick={() => addProjectBullet(project.id)}
              >
                <Plus className="h-3 w-3" />
                Add Bullet
              </Button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderEducation = () => {
    if (!sectionVisibility.education || !hasEducation) {
      return sectionVisibility.education ? (
        <div>
          <div className="flex items-center justify-between border-b border-gray-300 pb-1 text-gray-900 dark:text-gray-100 dark:border-gray-700">
            <h2 className="text-sm font-bold uppercase tracking-wide">
              Education
            </h2>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={addEducationEntry}
            >
              <Plus className="h-3 w-3" />
              Add Education
            </Button>
          </div>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 italic">
            Add education entries using the button above.
          </p>
        </div>
      ) : null;
    }

    return (
      <div>
        <div className="flex items-center justify-between border-b border-gray-300 pb-1 text-gray-900 dark:text-gray-100 dark:border-gray-700">
          <h2 className="text-sm font-bold uppercase tracking-wide">
            Education
          </h2>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={addEducationEntry}
          >
            <Plus className="h-3 w-3" />
            Add Education
          </Button>
        </div>
        <div className="mt-2 space-y-3">
          {education.map((entry) => {
            const primaryField =
              educationOrder === "degree-first" ? "degree" : "institution";
            const secondaryField =
              educationOrder === "degree-first" ? "institution" : "degree";
            const primaryFallback =
              educationOrder === "degree-first"
                ? "Degree"
                : "University Name";
            const secondaryFallback =
              educationOrder === "degree-first"
                ? "University Name"
                : "Degree";

            return (
              <div key={entry.id} className="group space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    <EditableText
                      value={entry[primaryField] ?? ""}
                      onChange={(value) =>
                        updateEducationEntry(entry.id, {
                          [primaryField]: value,
                        } as Partial<ResumeData["education"][number]>)
                      }
                      placeholder={primaryFallback}
                    />
                  </p>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-destructive"
                    onClick={() => removeEducationEntry(entry.id)}
                    aria-label="Remove education"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  <EditableText
                    value={entry[secondaryField] ?? ""}
                    onChange={(value) =>
                      updateEducationEntry(entry.id, {
                        [secondaryField]: value,
                      } as Partial<ResumeData["education"][number]>)
                    }
                    placeholder={secondaryFallback}
                  />
                  <span className="text-gray-400"> | </span>
                  <EditableText
                    value={entry.location ?? ""}
                    onChange={(value) =>
                      updateEducationEntry(entry.id, { location: value })
                    }
                    placeholder="Location"
                  />
                  {entry.gpa && (
                    <>
                      <span className="text-gray-400"> | </span>
                      <span className="inline-flex items-baseline gap-1">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          GPA:
                        </span>
                        <EditableText
                          value={entry.gpa}
                          onChange={(value) =>
                            updateEducationEntry(entry.id, { gpa: value })
                          }
                          placeholder="GPA"
                        />
                      </span>
                    </>
                  )}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderSkills = () => {
    if (!sectionVisibility.skills) return null;
    const renderSkillItem = (skill: SkillEntry) => (
      <span className="inline-flex items-center gap-1 group/skill">
        <EditableText
          value={skill.name}
          onChange={(value) => updateSkill(skill.id, { name: value })}
          placeholder="Skill"
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-4 w-4 text-muted-foreground opacity-0 transition group-hover/skill:opacity-100 hover:text-destructive"
          onClick={() => removeSkill(skill.id)}
          aria-label="Remove skill"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </span>
    );

    return (
      <div>
        <div className="flex items-center justify-between border-b border-gray-300 pb-1 text-gray-900 dark:text-gray-100 dark:border-gray-700">
          <h2 className="text-sm font-bold uppercase tracking-wide">Skills</h2>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => addSkill("")}
            >
              <Plus className="h-3 w-3" />
              Add Skill
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => addSkill("New Category")}
            >
              <Plus className="h-3 w-3" />
              Add Group
            </Button>
          </div>
        </div>
        {hasSkills ? (
          <div className="mt-2 space-y-1">
            {Object.entries(groupedSkills).map(
              ([category, categorySkills]) => (
                <div
                  key={category}
                  className="flex items-start justify-between gap-2"
                >
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    <span className="font-semibold">
                      <EditableText
                        value={category}
                        onChange={(value) =>
                          updateSkillCategory(category, value)
                        }
                        placeholder="Category"
                      />
                      :
                    </span>{" "}
                    {categorySkills.map((skill, index) => (
                      <Fragment key={skill.id}>
                        {renderSkillItem(skill)}
                        {index < categorySkills.length - 1 && ", "}
                      </Fragment>
                    ))}
                  </p>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                    onClick={() => addSkill(category)}
                    aria-label={`Add skill to ${category}`}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              )
            )}
            {ungroupedSkills.length > 0 && (
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {ungroupedSkills.map((skill, index) => (
                    <Fragment key={skill.id}>
                      {renderSkillItem(skill)}
                      {index < ungroupedSkills.length - 1 && ", "}
                    </Fragment>
                  ))}
                </p>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  onClick={() => addSkill("")}
                  aria-label="Add skill"
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 italic">
            Add skills using the buttons above.
          </p>
        )}
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
                      <EditableText
                        value={metadata.fullName}
                        onChange={(fullName) => updateMetadata({ fullName })}
                        placeholder="Your Name"
                      />
                    </h1>
                    <p className="mt-0.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                      <EditableText
                        value={metadata.subtitle}
                        onChange={(subtitle) => updateMetadata({ subtitle })}
                        placeholder="Professional Title"
                      />
                    </p>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                      <EditableText
                        value={metadata.contactInfo.email}
                        onChange={(email) => updateContactInfo({ email })}
                        placeholder="email@example.com"
                      />
                      <span className="text-gray-400"> | </span>
                      <EditableText
                        value={metadata.contactInfo.phone}
                        onChange={(phone) => updateContactInfo({ phone })}
                        placeholder="(555) 123-4567"
                      />
                      <span className="text-gray-400"> | </span>
                      <EditableText
                        value={metadata.contactInfo.location}
                        onChange={(location) => updateContactInfo({ location })}
                        placeholder="City, State"
                      />
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
                      <EditableText
                        value={metadata.fullName}
                        onChange={(fullName) => updateMetadata({ fullName })}
                        placeholder="Your Name"
                      />
                      <br />
                      <EditableText
                        value={metadata.contactInfo.location}
                        onChange={(location) =>
                          updateContactInfo({ location })
                        }
                        placeholder="Your Address"
                      />
                      <br />
                      <EditableText
                        value={metadata.contactInfo.email}
                        onChange={(email) => updateContactInfo({ email })}
                        placeholder="email@example.com"
                      />
                    </p>
                  </div>

                  {/* Date */}
                  <div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      <EditableText
                        value={coverLetter.date}
                        onChange={(date) => updateCoverLetter({ date })}
                        placeholder={todayFormatted}
                      />
                    </p>
                  </div>

                  {/* Recipient */}
                  <div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      <EditableText
                        value={coverLetter.hiringManager}
                        onChange={(hiringManager) =>
                          updateCoverLetter({ hiringManager })
                        }
                        placeholder="Hiring Manager"
                      />
                      <br />
                      <EditableText
                        value={coverLetter.companyAddress}
                        onChange={(companyAddress) =>
                          updateCoverLetter({ companyAddress })
                        }
                        placeholder={
                          "Company Name\nCompany Address\nCity, State ZIP"
                        }
                        multiline
                      />
                    </p>
                  </div>

                  {/* Greeting + body + sign-off */}
                  <div className="space-y-4">
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      Dear{" "}
                      <EditableText
                        value={coverLetter.hiringManager}
                        onChange={(hiringManager) =>
                          updateCoverLetter({ hiringManager })
                        }
                        placeholder="Hiring Manager"
                      />
                      ,
                    </p>
                    <EditableText
                      value={coverLetter.body}
                      onChange={(body) => updateCoverLetter({ body })}
                      placeholder={
                        "Your cover letter content will appear here. Use the Cover tab in the editor to write your letter."
                      }
                      className="text-sm leading-relaxed text-gray-700 dark:text-gray-300"
                      multiline
                    />
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      <EditableText
                        value={coverLetter.sendoff}
                        onChange={(sendoff) => updateCoverLetter({ sendoff })}
                        placeholder="Best Regards,"
                      />
                      <br />
                      <br />
                      <EditableText
                        value={metadata.fullName}
                        onChange={(fullName) => updateMetadata({ fullName })}
                        placeholder="Your Name"
                      />
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
