"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ClipboardEvent, CSSProperties, KeyboardEvent, ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DEFAULT_LAYOUT_PREFERENCES, PAPER_DIMENSIONS } from "@/lib/resume-defaults";
import { cn } from "@/lib/utils";
import type {
  ContactFieldKey,
  FontFamily,
  HeaderAlignment,
  ResumeData,
  SectionKey,
  SkillEntry,
  TextAlignment,
} from "@/types";
import { AlignCenter, AlignLeft, AlignRight, Plus, Trash2 } from "lucide-react";
import { usePagination } from "@/hooks/use-pagination";

const CONTACT_FIELDS = [
  {
    key: "email",
    placeholder: "email@example.com",
    optional: false,
    link: false,
  },
  {
    key: "phone",
    placeholder: "(555) 123-4567",
    optional: false,
    link: false,
  },
  {
    key: "location",
    placeholder: "City, State",
    optional: false,
    link: false,
  },
  {
    key: "linkedin",
    placeholder: "linkedin.com/in/username",
    optional: true,
    link: true,
  },
  {
    key: "website",
    placeholder: "yourwebsite.com",
    optional: true,
    link: true,
  },
  {
    key: "github",
    placeholder: "github.com/username",
    optional: true,
    link: true,
  },
] as const;

const FONT_FAMILY_MAP: Record<FontFamily, string> = {
  serif: "Georgia, 'Times New Roman', serif",
  sans: "var(--font-geist-sans), system-ui, sans-serif",
  mono: "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
};

interface ResumeViewerProps {
  resumeData: ResumeData;
  onResumeUpdate: (data: ResumeData) => void;
}

interface EditableTextProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
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
  style,
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
        multiline
          ? "block whitespace-pre-line break-words"
          : "inline-block max-w-full break-words align-baseline",
        className
      )}
      style={style}
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

  const resolvedLayoutPreferences = useMemo(
    () => ({
      ...DEFAULT_LAYOUT_PREFERENCES,
      ...layoutPreferences,
      contactOrder:
        layoutPreferences?.contactOrder ?? DEFAULT_LAYOUT_PREFERENCES.contactOrder,
      headerAlignment: {
        ...DEFAULT_LAYOUT_PREFERENCES.headerAlignment,
        ...layoutPreferences?.headerAlignment,
      },
      fontPreferences: {
        ...DEFAULT_LAYOUT_PREFERENCES.fontPreferences,
        ...layoutPreferences?.fontPreferences,
        sizes: {
          ...DEFAULT_LAYOUT_PREFERENCES.fontPreferences.sizes,
          ...layoutPreferences?.fontPreferences?.sizes,
        },
      },
    }),
    [layoutPreferences]
  );

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

  const paperMaxWidth = useMemo(() => {
    const { width } = PAPER_DIMENSIONS[pageSettings.paperSize];
    const pxPerMm = 72 / 25.4;
    return `${width * pxPerMm}px`;
  }, [pageSettings.paperSize]);

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
  const experienceOrder = resolvedLayoutPreferences.experienceOrder;
  const educationOrder = resolvedLayoutPreferences.educationOrder;
  const orderedSections = useMemo(() => {
    const fallback: SectionKey[] = [
      "summary",
      "experience",
      "projects",
      "education",
      "skills",
    ];
    const preferred = resolvedLayoutPreferences.sectionOrder ?? fallback;
    const seen = new Set<SectionKey>();
    return [...preferred, ...fallback].filter((section) => {
      if (seen.has(section)) return false;
      seen.add(section);
      return true;
    });
  }, [resolvedLayoutPreferences.sectionOrder]);

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

  const updateLayoutPreferences = (
    updates: Partial<ResumeData["layoutPreferences"]>
  ) => {
    onResumeUpdate({
      ...resumeData,
      layoutPreferences: {
        ...resolvedLayoutPreferences,
        ...updates,
        headerAlignment: {
          ...resolvedLayoutPreferences.headerAlignment,
          ...updates.headerAlignment,
        },
        fontPreferences: {
          ...resolvedLayoutPreferences.fontPreferences,
          ...updates.fontPreferences,
          sizes: {
            ...resolvedLayoutPreferences.fontPreferences.sizes,
            ...updates.fontPreferences?.sizes,
          },
        },
      },
    });
  };

  const updateHeaderAlignment = (
    field: keyof HeaderAlignment,
    value: TextAlignment
  ) => {
    updateLayoutPreferences({
      headerAlignment: {
        ...resolvedLayoutPreferences.headerAlignment,
        [field]: value,
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

  const contactOrder = useMemo(() => {
    const fallback = CONTACT_FIELDS.map((field) => field.key);
    const seen = new Set<ContactFieldKey>();
    return [...resolvedLayoutPreferences.contactOrder, ...fallback].filter(
      (key) => {
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }
    );
  }, [resolvedLayoutPreferences.contactOrder]);

  const contactFieldMap = useMemo(() => {
    return CONTACT_FIELDS.reduce(
      (acc, field) => {
        acc[field.key] = field;
        return acc;
      },
      {} as Record<ContactFieldKey, (typeof CONTACT_FIELDS)[number]>
    );
  }, []);

  const normalizeProfileUrl = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  };

  const headerAlignment = resolvedLayoutPreferences.headerAlignment;
  const fontPreferences = resolvedLayoutPreferences.fontPreferences;

  const alignmentClassMap: Record<TextAlignment, string> = {
    left: "text-left",
    center: "text-center",
    right: "text-right",
  };

  const getAlignmentClass = (value: TextAlignment) =>
    alignmentClassMap[value] ?? "text-left";

  const paperTypographyStyle = useMemo<CSSProperties>(
    () => ({
      fontFamily:
        FONT_FAMILY_MAP[fontPreferences.family] ?? FONT_FAMILY_MAP.serif,
    }),
    [fontPreferences.family]
  );

  const fontSizeStyles = useMemo(() => {
    const toStyle = (size: number): CSSProperties => ({ fontSize: `${size}px` });
    return {
      name: toStyle(fontPreferences.sizes.name),
      subtitle: toStyle(fontPreferences.sizes.subtitle),
      contact: toStyle(fontPreferences.sizes.contact),
      sectionTitle: toStyle(fontPreferences.sizes.sectionTitle),
      itemTitle: toStyle(fontPreferences.sizes.itemTitle),
      itemDetail: toStyle(fontPreferences.sizes.itemDetail),
      itemMeta: toStyle(fontPreferences.sizes.itemMeta),
      body: toStyle(fontPreferences.sizes.body),
    };
  }, [fontPreferences.sizes]);

  const renderInlineAlignment = (
    label: string,
    value: TextAlignment,
    onChange: (nextValue: TextAlignment) => void
  ) => (
    <div className="pointer-events-none absolute right-0 top-0 z-10 flex items-center gap-1 rounded-md border border-border bg-background/90 px-1 py-0.5 text-[10px] text-muted-foreground shadow-sm opacity-0 backdrop-blur-sm transition group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 print:hidden">
      <span className="px-1 text-[9px] uppercase tracking-wide text-muted-foreground/70">
        {label}
      </span>
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(nextValue) => {
          if (!nextValue) return;
          onChange(nextValue as TextAlignment);
        }}
        variant="outline"
        size="sm"
        className="justify-start"
        aria-label={`${label} alignment`}
      >
        <ToggleGroupItem
          value="left"
          className="h-6 w-6 min-w-0 px-0"
          aria-label="Align left"
        >
          <AlignLeft className="h-3 w-3" />
        </ToggleGroupItem>
        <ToggleGroupItem
          value="center"
          className="h-6 w-6 min-w-0 px-0"
          aria-label="Align center"
        >
          <AlignCenter className="h-3 w-3" />
        </ToggleGroupItem>
        <ToggleGroupItem
          value="right"
          className="h-6 w-6 min-w-0 px-0"
          aria-label="Align right"
        >
          <AlignRight className="h-3 w-3" />
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );

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

  // Granular renderers for pagination
  const renderSectionHeader = (title: string, addButton?: ReactNode) => (
    <div className="flex items-center justify-between border-b border-gray-300 pb-1 text-gray-900 dark:text-gray-100 dark:border-gray-700">
      <h2
        className="font-bold uppercase tracking-wide"
        style={fontSizeStyles.sectionTitle}
      >
        {title}
      </h2>
      {addButton}
    </div>
  );

  const renderSummaryHeader = () =>
    renderSectionHeader("Summary");

  const renderSummaryContent = () => (
    <EditableText
      value={metadata.summary}
      onChange={(summary) => updateMetadata({ summary })}
      placeholder="Your professional summary will appear here..."
      className="leading-relaxed text-gray-700 dark:text-gray-300"
      style={fontSizeStyles.body}
      multiline
    />
  );

  const renderExperienceHeader = () =>
    renderSectionHeader(
      "Experience",
      <Button
        variant="ghost"
        size="sm"
        className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
        onClick={addExperienceEntry}
      >
        <Plus className="h-3 w-3" />
        Add Experience
      </Button>
    );

  const renderExperienceItem = (entry: ResumeData["experience"][number]) => {
    const primaryField =
      experienceOrder === "title-first" ? "jobTitle" : "company";
    const secondaryField =
      experienceOrder === "title-first" ? "company" : "jobTitle";
    const primaryFallback =
      experienceOrder === "title-first" ? "Job Title" : "Company Name";
    const secondaryFallback =
      experienceOrder === "title-first" ? "Company Name" : "Job Title";
    return (
      <div className="group space-y-1">
        <div className="flex items-start justify-between gap-2">
          <span
            className="min-w-0 flex-1 font-semibold text-gray-900 dark:text-gray-100"
            style={fontSizeStyles.itemTitle}
          >
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
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-destructive"
              onClick={() => removeExperienceEntry(entry.id)}
              aria-label="Remove experience"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
            <span
              className="text-gray-600 dark:text-gray-400"
              style={fontSizeStyles.itemMeta}
            >
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
          </div>
        </div>
        <div className="flex items-start justify-between gap-2">
          <p
            className="min-w-0 flex-1 text-gray-700 dark:text-gray-300"
            style={fontSizeStyles.itemDetail}
          >
            <EditableText
              value={entry[secondaryField]}
              onChange={(value) =>
                updateExperienceEntry(entry.id, {
                  [secondaryField]: value,
                } as Partial<ResumeData["experience"][number]>)
              }
              placeholder={secondaryFallback}
            />
          </p>
          <p
            className="shrink-0 text-right text-gray-600 dark:text-gray-400"
            style={fontSizeStyles.itemDetail}
          >
            <EditableText
              value={entry.location}
              onChange={(value) =>
                updateExperienceEntry(entry.id, { location: value })
              }
              placeholder="Location"
            />
          </p>
        </div>
        {entry.bullets.length > 0 && (
          <ul
            className="mt-1 space-y-1 text-gray-600 dark:text-gray-400"
            style={fontSizeStyles.body}
            role="list"
          >
            {entry.bullets.map((bullet, idx) => (
              <li
                key={idx}
                className="group/bullet relative flex items-baseline gap-2"
              >
                <span
                  aria-hidden
                  className="self-baseline text-gray-600 dark:text-gray-400"
                >
                  •
                </span>
                <EditableText
                  value={bullet}
                  onChange={(value) =>
                    updateExperienceBullet(entry.id, idx, value)
                  }
                  placeholder="Describe your accomplishment..."
                  className="min-w-0 flex-1 break-words self-baseline block"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-[0.1em] h-4 w-4 text-muted-foreground opacity-0 transition pointer-events-none group-hover/bullet:opacity-100 group-hover/bullet:pointer-events-auto hover:text-destructive"
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
  };

  const renderExperienceEmpty = () => (
    <p
      className="text-gray-500 dark:text-gray-400 italic"
      style={fontSizeStyles.body}
    >
      Add experience entries using the button above.
    </p>
  );

  const renderProjectsHeader = () =>
    renderSectionHeader(
      "Projects",
      <Button
        variant="ghost"
        size="sm"
        className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
        onClick={addProjectEntry}
      >
        <Plus className="h-3 w-3" />
        Add Project
      </Button>
    );

  const renderProjectItem = (project: ResumeData["projects"][number]) => (
    <div className="group space-y-1">
      <div className="flex items-start justify-between gap-2">
        <span
          className="min-w-0 flex-1 font-semibold text-gray-900 dark:text-gray-100"
          style={fontSizeStyles.itemTitle}
        >
          <EditableText
            value={project.name}
            onChange={(value) =>
              updateProjectEntry(project.id, { name: value })
            }
            placeholder="Project Name"
          />
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-destructive"
            onClick={() => removeProjectEntry(project.id)}
            aria-label="Remove project"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
          <span
            className="text-right text-gray-500 dark:text-gray-400"
            style={fontSizeStyles.itemMeta}
          >
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
        </div>
      </div>
      <EditableText
        value={project.description}
        onChange={(value) =>
          updateProjectEntry(project.id, { description: value })
        }
        placeholder="Project description"
        className="text-gray-700 dark:text-gray-300"
        style={fontSizeStyles.body}
        multiline
      />
      {project.bullets.length > 0 && (
        <ul
          className="mt-1 space-y-1 text-gray-600 dark:text-gray-400"
          style={fontSizeStyles.body}
          role="list"
        >
          {project.bullets.map((bullet, idx) => (
            <li
              key={idx}
              className="group/bullet relative flex items-baseline gap-2"
            >
              <span
                aria-hidden
                className="self-baseline text-gray-600 dark:text-gray-400"
              >
                •
              </span>
              <EditableText
                value={bullet}
                onChange={(value) =>
                  updateProjectBullet(project.id, idx, value)
                }
                placeholder="Project impact..."
                className="min-w-0 flex-1 break-words self-baseline block"
              />
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-0 top-[0.1em] h-4 w-4 text-muted-foreground opacity-0 transition pointer-events-none group-hover/bullet:opacity-100 group-hover/bullet:pointer-events-auto hover:text-destructive"
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
  );

  const renderProjectsEmpty = () => (
    <p
      className="text-gray-500 dark:text-gray-400 italic"
      style={fontSizeStyles.body}
    >
      Add project entries using the button above.
    </p>
  );

  const renderEducationHeader = () =>
    renderSectionHeader(
      "Education",
      <Button
        variant="ghost"
        size="sm"
        className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
        onClick={addEducationEntry}
      >
        <Plus className="h-3 w-3" />
        Add Education
      </Button>
    );

  const renderEducationItem = (entry: ResumeData["education"][number]) => {
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
      <div className="group space-y-1">
        <div className="flex items-start justify-between gap-2">
          <p
            className="font-semibold text-gray-900 dark:text-gray-100"
            style={fontSizeStyles.itemTitle}
          >
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
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-destructive"
              onClick={() => removeEducationEntry(entry.id)}
              aria-label="Remove education"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
            <span
              className="text-gray-600 dark:text-gray-400"
              style={fontSizeStyles.itemMeta}
            >
              <EditableText
                value={entry.graduationDate ?? ""}
                onChange={(value) =>
                  updateEducationEntry(entry.id, { graduationDate: value })
                }
                placeholder="Graduation"
              />
            </span>
          </div>
        </div>
        <div className="flex items-start justify-between gap-2">
          <p
            className="text-gray-700 dark:text-gray-300"
            style={fontSizeStyles.itemDetail}
          >
            <EditableText
              value={entry[secondaryField] ?? ""}
              onChange={(value) =>
                updateEducationEntry(entry.id, {
                  [secondaryField]: value,
                } as Partial<ResumeData["education"][number]>)
              }
              placeholder={secondaryFallback}
            />
            {entry.gpa && (
              <>
                <span className="text-gray-400"> | </span>
                <span className="inline-flex items-baseline gap-1">
                  <span
                    className="text-gray-500 dark:text-gray-400"
                    style={fontSizeStyles.itemMeta}
                  >
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
          <p
            className="text-right text-gray-600 dark:text-gray-400"
            style={fontSizeStyles.itemDetail}
          >
            <EditableText
              value={entry.location ?? ""}
              onChange={(value) =>
                updateEducationEntry(entry.id, { location: value })
              }
              placeholder="Location"
            />
          </p>
        </div>
      </div>
    );
  };

  const renderEducationEmpty = () => (
    <p
      className="text-gray-500 dark:text-gray-400 italic"
      style={fontSizeStyles.body}
    >
      Add education entries using the button above.
    </p>
  );

  const renderSkillsHeader = () =>
    renderSectionHeader(
      "Skills",
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
    );

  const renderSkillsContent = () => {
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
      <div className="space-y-1">
        {Object.entries(groupedSkills).map(
          ([category, categorySkills]) => (
            <div
              key={category}
              className="flex items-start justify-between gap-2"
            >
              <p
                className="text-gray-700 dark:text-gray-300"
                style={fontSizeStyles.body}
              >
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
            <p
              className="text-gray-700 dark:text-gray-300"
              style={fontSizeStyles.body}
            >
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
    );
  };

  const renderSkillsEmpty = () => (
    <p
      className="text-gray-500 dark:text-gray-400 italic"
      style={fontSizeStyles.body}
    >
      Add skills using the buttons above.
    </p>
  );

  // Pagination hooks for resume and cover letter
  const resumePagination = usePagination({
    paperSize: pageSettings.paperSize,
    margins: pageSettings.margins,
    elementGap: 16, // space-y-4 = 1rem = 16px
  });

  const coverLetterPagination = usePagination({
    paperSize: pageSettings.paperSize,
    margins: pageSettings.margins,
    elementGap: 24, // space-y-6 = 1.5rem = 24px
  });

  // Build the list of measurable elements for the resume (granular for proper pagination)
  const resumeElements = useMemo(() => {
    const elements: Array<{ id: string; isHeader: boolean; render: () => ReactNode }> = [];

    // Header is always first
    elements.push({
      id: "header",
      isHeader: false,
      render: () => (
        <div>
          <div
            className={cn(
              "relative w-full group",
              getAlignmentClass(headerAlignment.name)
            )}
          >
            {renderInlineAlignment("Name", headerAlignment.name, (value) =>
              updateHeaderAlignment("name", value)
            )}
            <h1
              className="font-bold text-gray-900 dark:text-gray-100"
              style={fontSizeStyles.name}
            >
              <EditableText
                value={metadata.fullName}
                onChange={(fullName) => updateMetadata({ fullName })}
                placeholder="Your Name"
              />
            </h1>
          </div>
          <div
            className={cn(
              "relative w-full group",
              getAlignmentClass(headerAlignment.subtitle)
            )}
          >
            {renderInlineAlignment("Subtitle", headerAlignment.subtitle, (value) =>
              updateHeaderAlignment("subtitle", value)
            )}
            <p
              className="mt-0.5 font-medium text-gray-700 dark:text-gray-300"
              style={fontSizeStyles.subtitle}
            >
              <EditableText
                value={metadata.subtitle}
                onChange={(subtitle) => updateMetadata({ subtitle })}
                placeholder="Professional Title"
              />
            </p>
          </div>
          <div
            className={cn(
              "relative w-full group",
              getAlignmentClass(headerAlignment.contact)
            )}
          >
            {renderInlineAlignment("Contact", headerAlignment.contact, (value) =>
              updateHeaderAlignment("contact", value)
            )}
            <p
              className="mt-1 text-gray-600 dark:text-gray-400"
              style={fontSizeStyles.contact}
            >
              {(() => {
                type ContactItem = {
                  key: ContactFieldKey;
                  value: string;
                  placeholder: string;
                  onChange: (value: string) => void;
                  link: boolean;
                  href: string;
                };

                const contactItems = contactOrder
                  .map((key) => {
                    const field = contactFieldMap[key];
                    if (!field) return null;
                    const value = metadata.contactInfo[key] ?? "";
                    if (field.optional && value.trim().length === 0) {
                      return null;
                    }
                    const onChange = (nextValue: string) =>
                      updateContactInfo({ [key]: nextValue });
                    return {
                      key,
                      value,
                      placeholder: field.placeholder,
                      onChange,
                      link: field.link,
                      href: field.link ? normalizeProfileUrl(value) : "",
                    };
                  })
                  .filter((item): item is ContactItem => Boolean(item));

                return contactItems.map((item, index) => (
                  <Fragment key={item.key}>
                    {item.link ? (
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline underline-offset-2"
                        onClick={(event) => event.preventDefault()}
                      >
                        <EditableText
                          value={item.value}
                          onChange={item.onChange}
                          placeholder={item.placeholder}
                        />
                      </a>
                    ) : (
                      <EditableText
                        value={item.value}
                        onChange={item.onChange}
                        placeholder={item.placeholder}
                      />
                    )}
                    {index < contactItems.length - 1 && (
                      <span className="text-gray-400"> | </span>
                    )}
                  </Fragment>
                ));
              })()}
            </p>
          </div>
        </div>
      ),
    });

    // Add sections in order with granular elements
    for (const section of orderedSections) {
      if (section === "summary" && sectionVisibility.summary) {
        // Summary: header + content
        elements.push({
          id: "summary-header",
          isHeader: true,
          render: renderSummaryHeader,
        });
        elements.push({
          id: "summary-content",
          isHeader: false,
          render: renderSummaryContent,
        });
      } else if (section === "experience" && sectionVisibility.experience) {
        // Experience: header + individual items
        elements.push({
          id: "experience-header",
          isHeader: true,
          render: renderExperienceHeader,
        });
        if (experience.length === 0) {
          elements.push({
            id: "experience-empty",
            isHeader: false,
            render: renderExperienceEmpty,
          });
        } else {
          for (const entry of experience) {
            elements.push({
              id: `experience-${entry.id}`,
              isHeader: false,
              render: () => renderExperienceItem(entry),
            });
          }
        }
      } else if (section === "projects" && sectionVisibility.projects) {
        // Projects: header + individual items
        elements.push({
          id: "projects-header",
          isHeader: true,
          render: renderProjectsHeader,
        });
        if (projects.length === 0) {
          elements.push({
            id: "projects-empty",
            isHeader: false,
            render: renderProjectsEmpty,
          });
        } else {
          for (const project of projects) {
            elements.push({
              id: `project-${project.id}`,
              isHeader: false,
              render: () => renderProjectItem(project),
            });
          }
        }
      } else if (section === "education" && sectionVisibility.education) {
        // Education: header + individual items
        elements.push({
          id: "education-header",
          isHeader: true,
          render: renderEducationHeader,
        });
        if (education.length === 0) {
          elements.push({
            id: "education-empty",
            isHeader: false,
            render: renderEducationEmpty,
          });
        } else {
          for (const entry of education) {
            elements.push({
              id: `education-${entry.id}`,
              isHeader: false,
              render: () => renderEducationItem(entry),
            });
          }
        }
      } else if (section === "skills" && sectionVisibility.skills) {
        // Skills: header + content (keep as single element since skills are compact)
        elements.push({
          id: "skills-header",
          isHeader: true,
          render: renderSkillsHeader,
        });
        if (skills.length === 0) {
          elements.push({
            id: "skills-empty",
            isHeader: false,
            render: renderSkillsEmpty,
          });
        } else {
          elements.push({
            id: "skills-content",
            isHeader: false,
            render: renderSkillsContent,
          });
        }
      }
    }

    return elements;
  }, [
    metadata,
    orderedSections,
    sectionVisibility,
    experience,
    projects,
    education,
    skills,
    groupedSkills,
    ungroupedSkills,
    experienceOrder,
    educationOrder,
    contactOrder,
    contactFieldMap,
    normalizeProfileUrl,
    headerAlignment,
    fontSizeStyles,
    getAlignmentClass,
    renderInlineAlignment,
    updateContactInfo,
    updateHeaderAlignment,
  ]);

  // Build cover letter elements
  const coverLetterElements = useMemo(() => {
    const elements: Array<{ id: string; isHeader: boolean; render: () => ReactNode }> = [];

    elements.push({
      id: "cl-sender",
      isHeader: false,
      render: () => (
        <div>
          <p
            className="text-gray-700 dark:text-gray-300"
            style={fontSizeStyles.body}
          >
            <EditableText
              value={metadata.fullName}
              onChange={(fullName) => updateMetadata({ fullName })}
              placeholder="Your Name"
            />
            <br />
            <EditableText
              value={metadata.contactInfo.location}
              onChange={(location) => updateContactInfo({ location })}
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
      ),
    });

    elements.push({
      id: "cl-date",
      isHeader: false,
      render: () => (
        <div>
          <p
            className="text-gray-700 dark:text-gray-300"
            style={fontSizeStyles.itemMeta}
          >
            <EditableText
              value={coverLetter.date}
              onChange={(date) => updateCoverLetter({ date })}
              placeholder={todayFormatted}
            />
          </p>
        </div>
      ),
    });

    elements.push({
      id: "cl-recipient",
      isHeader: false,
      render: () => (
        <div>
          <p
            className="text-gray-700 dark:text-gray-300"
            style={fontSizeStyles.body}
          >
            <EditableText
              value={coverLetter.hiringManager}
              onChange={(hiringManager) => updateCoverLetter({ hiringManager })}
              placeholder="Hiring Manager"
            />
            <br />
            <EditableText
              value={coverLetter.companyAddress}
              onChange={(companyAddress) => updateCoverLetter({ companyAddress })}
              placeholder={"Company Name\nCompany Address\nCity, State ZIP"}
              multiline
            />
          </p>
        </div>
      ),
    });

    elements.push({
      id: "cl-body",
      isHeader: false,
      render: () => (
        <div className="space-y-4">
          <p
            className="text-gray-700 dark:text-gray-300"
            style={fontSizeStyles.body}
          >
            Dear{" "}
            <EditableText
              value={coverLetter.hiringManager}
              onChange={(hiringManager) => updateCoverLetter({ hiringManager })}
              placeholder="Hiring Manager"
            />
            ,
          </p>
          <EditableText
            value={coverLetter.body}
            onChange={(body) => updateCoverLetter({ body })}
            placeholder="Your cover letter content will appear here. Use the Cover tab in the editor to write your letter."
            className="leading-relaxed text-gray-700 dark:text-gray-300"
            style={fontSizeStyles.body}
            multiline
          />
          <p
            className="text-gray-700 dark:text-gray-300"
            style={fontSizeStyles.body}
          >
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
      ),
    });

    return elements;
  }, [metadata, coverLetter, todayFormatted, fontSizeStyles]);

  // Register elements with pagination hooks
  useEffect(() => {
    resumePagination.setElements(
      resumeElements.map((e) => ({ id: e.id, isHeader: e.isHeader }))
    );
  }, [resumeElements, resumePagination.setElements]);

  useEffect(() => {
    coverLetterPagination.setElements(
      coverLetterElements.map((e) => ({ id: e.id, isHeader: e.isHeader }))
    );
  }, [coverLetterElements, coverLetterPagination.setElements]);

  // Map element IDs to their page assignments, defaulting to page 0 for unmeasured elements
  const resumeElementPages = useMemo(() => {
    const map = new Map<string, number>();
    // First, assign all elements to page 0 as default
    for (const el of resumeElements) {
      map.set(el.id, 0);
    }
    // Then, update with actual page assignments from pagination
    for (const page of resumePagination.pages) {
      for (const el of page.elements) {
        map.set(el.id, page.pageIndex);
      }
    }
    return map;
  }, [resumePagination.pages, resumeElements]);

  const coverLetterElementPages = useMemo(() => {
    const map = new Map<string, number>();
    // First, assign all elements to page 0 as default
    for (const el of coverLetterElements) {
      map.set(el.id, 0);
    }
    // Then, update with actual page assignments from pagination
    for (const page of coverLetterPagination.pages) {
      for (const el of page.elements) {
        map.set(el.id, page.pageIndex);
      }
    }
    return map;
  }, [coverLetterPagination.pages, coverLetterElements]);

  // Calculate paper height in pixels for page containers
  const getPageHeightStyle = (pageDimensions: { pageHeightPx: number } | null) => {
    if (!pageDimensions) {
      const { width, height } = PAPER_DIMENSIONS[pageSettings.paperSize];
      return { aspectRatio: `${width} / ${height}` };
    }
    return { height: `${pageDimensions.pageHeightPx}px` };
  };

  // Get unique page indices (ensure at least page 0 exists)
  const resumePageIndices = useMemo(() => {
    const indices = new Set<number>([0]);
    for (const page of resumePagination.pages) {
      indices.add(page.pageIndex);
    }
    return Array.from(indices).sort((a, b) => a - b);
  }, [resumePagination.pages]);

  const coverLetterPageIndices = useMemo(() => {
    const indices = new Set<number>([0]);
    for (const page of coverLetterPagination.pages) {
      indices.add(page.pageIndex);
    }
    return Array.from(indices).sort((a, b) => a - b);
  }, [coverLetterPagination.pages]);

  // Pre-create ref callbacks to satisfy eslint
  const resumeRefCallbacks = useMemo(() => {
    const callbacks = new Map<string, (el: HTMLElement | null) => void>();
    for (const el of resumeElements) {
      callbacks.set(el.id, resumePagination.measureRef(el.id));
    }
    return callbacks;
  }, [resumeElements, resumePagination.measureRef]);

  const coverLetterRefCallbacks = useMemo(() => {
    const callbacks = new Map<string, (el: HTMLElement | null) => void>();
    for (const el of coverLetterElements) {
      callbacks.set(el.id, coverLetterPagination.measureRef(el.id));
    }
    return callbacks;
  }, [coverLetterElements, coverLetterPagination.measureRef]);

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
            <TabsContent
              value="resume"
              className="mt-0 w-full"
              style={{ maxWidth: paperMaxWidth }}
            >
              <div
                ref={resumePagination.containerRef}
                className="resume-pages flex flex-col gap-8"
              >
                {/* eslint-disable-next-line react-hooks/refs */}
                {resumePageIndices.map((pageIndex) => (
                  <div
                    key={pageIndex}
                  className="document-paper rounded-sm overflow-hidden"
                  style={{
                      ...paperStyle,
                      ...getPageHeightStyle(resumePagination.pageDimensions),
                      ...paperTypographyStyle,
                    }}
                  >
                    <div className="space-y-4">
                      {resumeElements
                        .filter((el) => resumeElementPages.get(el.id) === pageIndex)
                        .map((element) => (
                          <div
                            key={element.id}
                            ref={resumeRefCallbacks.get(element.id)}
                          >
                            {element.render()}
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent
              value="cover-letter"
              className="mt-0 w-full"
              style={{ maxWidth: paperMaxWidth }}
            >
              <div
                ref={coverLetterPagination.containerRef}
                className="cover-letter-pages flex flex-col gap-8"
              >
                {/* eslint-disable-next-line react-hooks/refs */}
                {coverLetterPageIndices.map((pageIndex) => (
                  <div
                    key={pageIndex}
                  className="document-paper rounded-sm overflow-hidden"
                  style={{
                      ...paperStyle,
                      ...getPageHeightStyle(coverLetterPagination.pageDimensions),
                      ...paperTypographyStyle,
                    }}
                  >
                    <div className="space-y-6">
                      {coverLetterElements
                        .filter((el) => coverLetterElementPages.get(el.id) === pageIndex)
                        .map((element) => (
                          <div
                            key={element.id}
                            ref={coverLetterRefCallbacks.get(element.id)}
                          >
                            {element.render()}
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>
    </div>
  );
}
