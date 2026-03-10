"use client";

import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ClipboardEvent,
  CSSProperties,
  KeyboardEvent,
  ReactNode,
} from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { getFontStack, normalizeFontFamily } from "@/lib/font-options";
import {
  clampLayoutSpacing,
  DEFAULT_LAYOUT_PREFERENCES,
  DEFAULT_PAGE_SETTINGS,
  DEFAULT_RESUME_DATA,
  PAPER_DIMENSIONS,
} from "@/lib/resume-defaults";
import {
  applyReplacementTemplate,
  parseFieldPath,
  setResumeValueAtPath,
} from "@/lib/resume-analysis";
import {
  buildFieldLengthConstraint,
  estimateWrappedLineCount,
  getFontSafetyBuffer,
  type FieldLengthConstraint,
} from "@/lib/line-constraints";
import { createId } from "@/lib/id";
import { cn } from "@/lib/utils";
import type {
  ContactFieldKey,
  HeaderAlignment,
  ResumeData,
  ResumeAnalysisState,
  SectionKey,
  SkillEntry,
  TextHyperlink,
  TextAlignment,
} from "@/types";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  FileDown,
  Link2,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
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

interface ResumeViewerProps {
  resumeData: ResumeData;
  onResumeUpdate: (data: ResumeData) => void;
  analysis: ResumeAnalysisState | null;
  onApplySuggestion: (
    path: string,
    suggestionId: string,
    replacement: string
  ) => void;
  maxResumePages?: number;
  onPageCountChange?: (counts: {
    resumePages: number;
    coverLetterPages: number;
    isPrintPreviewMode: boolean;
  }) => void;
  debugData?: unknown;
  onApplyDebugChanges?: () => void;
  readOnly?: boolean;
  allowCoverLetterTabInReadOnly?: boolean;
  autoScaleToFit?: boolean;
  documentTab?: "resume" | "cover-letter";
  onDocumentTabChange?: (tab: "resume" | "cover-letter") => void;
  documentTabControl?: "tabs" | "select" | "none";
  toolbarActionsSlot?: ReactNode;
  showToolbarActionsInReadOnly?: boolean;
  onToolbarActionsReady?: (actions: {
    exportPdf: () => void;
    togglePrintPreview: () => void;
    toggleDebug: () => void;
    setPrintPreviewMode: (enabled: boolean) => void;
    setDebugOpen: (open: boolean) => void;
  }) => void;
  onToolbarStateChange?: (state: {
    isPrintPreviewMode: boolean;
    isDebugOpen: boolean;
    isExportingPdf: boolean;
  }) => void;
  highlightFieldPaths?: string[];
  impliedHighlightFieldPaths?: string[];
  highlightTone?: "before" | "after";
}

interface EditableTextProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
  multiline?: boolean;
  fieldPath?: string;
}

const normalizeText = (value: string, multiline: boolean) => {
  const normalized = value.replace(/\u00a0/g, " ");
  return multiline ? normalized : normalized.replace(/\n+/g, " ");
};

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord | null => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as UnknownRecord;
};

const asString = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;

const asNumber = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const asBoolean = (value: unknown, fallback: boolean) =>
  typeof value === "boolean" ? value : fallback;

const asStringArray = (value: unknown, fallback: string[]) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : fallback;

const asOneOf = <T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T
) =>
  typeof value === "string" && allowed.includes(value as T)
    ? (value as T)
    : fallback;

const withFallbackMargins = (
  value: unknown,
  fallback: ResumeData["pageSettings"]["resumeMargins"]
) => {
  const objectValue = asRecord(value);
  if (!objectValue) return fallback;
  return {
    top: asNumber(objectValue.top, fallback.top),
    right: asNumber(objectValue.right, fallback.right),
    bottom: asNumber(objectValue.bottom, fallback.bottom),
    left: asNumber(objectValue.left, fallback.left),
  };
};

const normalizeResumeFromDebugInput = (
  value: unknown,
  fallback: ResumeData
): ResumeData | null => {
  const root = asRecord(value);
  if (!root) return null;
  const input = asRecord(root.resumeData) ?? root;

  const pageSettings = asRecord(input.pageSettings);
  const metadata = asRecord(input.metadata);
  const sectionVisibility = asRecord(input.sectionVisibility);
  const layoutPreferences = asRecord(input.layoutPreferences);
  const contactInfo = asRecord(metadata?.contactInfo);
  const headerAlignment = asRecord(layoutPreferences?.headerAlignment);
  const fontPreferences = asRecord(layoutPreferences?.fontPreferences);
  const coverLetterFontPreferences = asRecord(
    layoutPreferences?.coverLetterFontPreferences
  );
  const spacing = asRecord(layoutPreferences?.spacing);
  const fontSizes = asRecord(fontPreferences?.sizes);
  const coverLetterFontSizes = asRecord(coverLetterFontPreferences?.sizes);
  const coverLetter = asRecord(input.coverLetter);
  const marginPresets = ["narrow", "normal", "moderate"] as const;
  const paperSizes = ["a4", "letter"] as const;
  const alignments = ["left", "center", "right"] as const;
  const experienceOrders = ["title-first", "company-first"] as const;
  const educationOrders = ["degree-first", "institution-first"] as const;
  const educationMetadataPlacements = ["inline", "stacked"] as const;
  const sectionKeys = ["summary", "experience", "projects", "education", "skills"] as const;
  const contactKeys = [
    "email",
    "phone",
    "location",
    "linkedin",
    "website",
    "github",
  ] as const;

  const normalizedSectionOrder = asStringArray(
    layoutPreferences?.sectionOrder,
    fallback.layoutPreferences.sectionOrder
  ).filter((item): item is SectionKey =>
    (sectionKeys as readonly string[]).includes(item)
  );
  const normalizedContactOrder = asStringArray(
    layoutPreferences?.contactOrder,
    fallback.layoutPreferences.contactOrder
  ).filter((item): item is ContactFieldKey =>
    (contactKeys as readonly string[]).includes(item)
  );

  const normalizedExperience = Array.isArray(input.experience)
    ? input.experience.flatMap((item) => {
        const entry = asRecord(item);
        if (!entry) return [];
        return [
          {
            id: asString(entry.id, createId()),
            company: asString(entry.company),
            jobTitle: asString(entry.jobTitle),
            location: asString(entry.location),
            startDate: asString(entry.startDate),
            endDate: asString(entry.endDate),
            bullets: asStringArray(entry.bullets, []),
          },
        ];
      })
    : fallback.experience;

  const normalizedProjects = Array.isArray(input.projects)
    ? input.projects.flatMap((item) => {
        const entry = asRecord(item);
        if (!entry) return [];
        return [
          {
            id: asString(entry.id, createId()),
            name: asString(entry.name),
            technologies: asStringArray(entry.technologies, []),
            bullets: asStringArray(entry.bullets, []),
          },
        ];
      })
    : fallback.projects;

  const normalizedEducation = Array.isArray(input.education)
    ? input.education.flatMap((item) => {
        const entry = asRecord(item);
        if (!entry) return [];
        return [
          {
            id: asString(entry.id, createId()),
            degree: asString(entry.degree),
            institution: asString(entry.institution),
            location: asString(entry.location),
            field: asString(entry.field),
            graduationDate: asString(entry.graduationDate),
            gpa: asString(entry.gpa),
            other: asString(entry.other),
          },
        ];
      })
    : fallback.education;

  const normalizedSkills = Array.isArray(input.skills)
    ? input.skills.flatMap((item) => {
        const entry = asRecord(item);
        if (!entry) return [];
        return [
          {
            id: asString(entry.id, createId()),
            name: asString(entry.name),
            category: asString(entry.category),
          },
        ];
      })
    : fallback.skills;

  const normalizedHyperlinks = Array.isArray(input.hyperlinks)
    ? input.hyperlinks.flatMap((item) => {
        const entry = asRecord(item);
        if (!entry) return [];
        return [
          {
            id: asString(entry.id, createId()),
            path: asString(entry.path),
            start: Math.max(0, Math.floor(asNumber(entry.start, 0))),
            end: Math.max(0, Math.floor(asNumber(entry.end, 0))),
            text: asString(entry.text),
            url: asString(entry.url),
          },
        ];
      })
    : fallback.hyperlinks ?? [];

  return {
    pageSettings: {
      paperSize: asOneOf(
        pageSettings?.paperSize,
        paperSizes,
        fallback.pageSettings.paperSize
      ),
      resumeMargins: withFallbackMargins(
        pageSettings?.resumeMargins,
        fallback.pageSettings.resumeMargins
      ),
      resumeMarginPreset: asOneOf(
        pageSettings?.resumeMarginPreset,
        marginPresets,
        fallback.pageSettings.resumeMarginPreset
      ),
      coverLetterMargins: withFallbackMargins(
        pageSettings?.coverLetterMargins,
        fallback.pageSettings.coverLetterMargins
      ),
      coverLetterMarginPreset: asOneOf(
        pageSettings?.coverLetterMarginPreset,
        marginPresets,
        fallback.pageSettings.coverLetterMarginPreset
      ),
      margins: withFallbackMargins(
        pageSettings?.margins,
        fallback.pageSettings.margins ?? fallback.pageSettings.resumeMargins
      ),
      marginPreset: asOneOf(
        pageSettings?.marginPreset,
        marginPresets,
        fallback.pageSettings.marginPreset ?? fallback.pageSettings.resumeMarginPreset
      ),
    },
    metadata: {
      fullName: asString(metadata?.fullName, fallback.metadata.fullName),
      subtitle: asString(metadata?.subtitle, fallback.metadata.subtitle),
      contactInfo: {
        email: asString(contactInfo?.email, fallback.metadata.contactInfo.email),
        phone: asString(contactInfo?.phone, fallback.metadata.contactInfo.phone),
        location: asString(
          contactInfo?.location,
          fallback.metadata.contactInfo.location
        ),
        linkedin: asString(
          contactInfo?.linkedin,
          fallback.metadata.contactInfo.linkedin ?? ""
        ),
        website: asString(
          contactInfo?.website,
          fallback.metadata.contactInfo.website ?? ""
        ),
        github: asString(
          contactInfo?.github,
          fallback.metadata.contactInfo.github ?? ""
        ),
      },
      summary: asString(metadata?.summary, fallback.metadata.summary),
    },
    sectionVisibility: {
      summary: asBoolean(
        sectionVisibility?.summary,
        fallback.sectionVisibility.summary
      ),
      experience: asBoolean(
        sectionVisibility?.experience,
        fallback.sectionVisibility.experience
      ),
      projects: asBoolean(
        sectionVisibility?.projects,
        fallback.sectionVisibility.projects
      ),
      education: asBoolean(
        sectionVisibility?.education,
        fallback.sectionVisibility.education
      ),
      skills: asBoolean(sectionVisibility?.skills, fallback.sectionVisibility.skills),
    },
    layoutPreferences: {
      experienceOrder: asOneOf(
        layoutPreferences?.experienceOrder,
        experienceOrders,
        fallback.layoutPreferences.experienceOrder
      ),
      educationOrder: asOneOf(
        layoutPreferences?.educationOrder,
        educationOrders,
        fallback.layoutPreferences.educationOrder
      ),
      educationMetadataPlacement: asOneOf(
        layoutPreferences?.educationMetadataPlacement,
        educationMetadataPlacements,
        fallback.layoutPreferences.educationMetadataPlacement
      ),
      sectionOrder:
        normalizedSectionOrder.length > 0
          ? normalizedSectionOrder
          : fallback.layoutPreferences.sectionOrder,
      contactOrder:
        normalizedContactOrder.length > 0
          ? normalizedContactOrder
          : fallback.layoutPreferences.contactOrder,
      headerAlignment: {
        name: asOneOf(
          headerAlignment?.name,
          alignments,
          fallback.layoutPreferences.headerAlignment.name
        ),
        subtitle: asOneOf(
          headerAlignment?.subtitle,
          alignments,
          fallback.layoutPreferences.headerAlignment.subtitle
        ),
        contact: asOneOf(
          headerAlignment?.contact,
          alignments,
          fallback.layoutPreferences.headerAlignment.contact
        ),
      },
      fontPreferences: {
        family: normalizeFontFamily(
          fontPreferences?.family,
          fallback.layoutPreferences.fontPreferences.family
        ),
        sizes: {
          name: asNumber(
            fontSizes?.name,
            fallback.layoutPreferences.fontPreferences.sizes.name
          ),
          subtitle: asNumber(
            fontSizes?.subtitle,
            fallback.layoutPreferences.fontPreferences.sizes.subtitle
          ),
          contact: asNumber(
            fontSizes?.contact,
            fallback.layoutPreferences.fontPreferences.sizes.contact
          ),
          sectionTitle: asNumber(
            fontSizes?.sectionTitle,
            fallback.layoutPreferences.fontPreferences.sizes.sectionTitle
          ),
          itemTitle: asNumber(
            fontSizes?.itemTitle,
            fallback.layoutPreferences.fontPreferences.sizes.itemTitle
          ),
          itemDetail: asNumber(
            fontSizes?.itemDetail,
            fallback.layoutPreferences.fontPreferences.sizes.itemDetail
          ),
          itemMeta: asNumber(
            fontSizes?.itemMeta,
            fallback.layoutPreferences.fontPreferences.sizes.itemMeta
          ),
          body: asNumber(
            fontSizes?.body,
            fallback.layoutPreferences.fontPreferences.sizes.body
          ),
        },
      },
      coverLetterFontPreferences: {
        family: normalizeFontFamily(
          coverLetterFontPreferences?.family,
          fallback.layoutPreferences.coverLetterFontPreferences.family
        ),
        sizes: {
          name: asNumber(
            coverLetterFontSizes?.name,
            fallback.layoutPreferences.coverLetterFontPreferences.sizes.name
          ),
          subtitle: asNumber(
            coverLetterFontSizes?.subtitle,
            fallback.layoutPreferences.coverLetterFontPreferences.sizes.subtitle
          ),
          contact: asNumber(
            coverLetterFontSizes?.contact,
            fallback.layoutPreferences.coverLetterFontPreferences.sizes.contact
          ),
          sectionTitle: asNumber(
            coverLetterFontSizes?.sectionTitle,
            fallback.layoutPreferences.coverLetterFontPreferences.sizes.sectionTitle
          ),
          itemTitle: asNumber(
            coverLetterFontSizes?.itemTitle,
            fallback.layoutPreferences.coverLetterFontPreferences.sizes.itemTitle
          ),
          itemDetail: asNumber(
            coverLetterFontSizes?.itemDetail,
            fallback.layoutPreferences.coverLetterFontPreferences.sizes.itemDetail
          ),
          itemMeta: asNumber(
            coverLetterFontSizes?.itemMeta,
            fallback.layoutPreferences.coverLetterFontPreferences.sizes.itemMeta
          ),
          body: asNumber(
            coverLetterFontSizes?.body,
            fallback.layoutPreferences.coverLetterFontPreferences.sizes.body
          ),
        },
      },
      spacing: {
        nameGap: clampLayoutSpacing(
          asNumber(spacing?.nameGap, fallback.layoutPreferences.spacing.nameGap)
        ),
        contactGap: clampLayoutSpacing(
          asNumber(
            spacing?.contactGap,
            fallback.layoutPreferences.spacing.contactGap
          )
        ),
        bulletGap: clampLayoutSpacing(
          asNumber(
            spacing?.bulletGap,
            fallback.layoutPreferences.spacing.bulletGap
          )
        ),
        entryGap: clampLayoutSpacing(
          asNumber(spacing?.entryGap, fallback.layoutPreferences.spacing.entryGap)
        ),
        sectionGap: clampLayoutSpacing(
          asNumber(
            spacing?.sectionGap,
            fallback.layoutPreferences.spacing.sectionGap
          )
        ),
        sectionContentGap: clampLayoutSpacing(
          asNumber(
            spacing?.sectionContentGap,
            fallback.layoutPreferences.spacing.sectionContentGap
          )
        ),
      },
      hyperlinkUnderline: asBoolean(
        layoutPreferences?.hyperlinkUnderline,
        fallback.layoutPreferences.hyperlinkUnderline
      ),
    },
    aboutMe: asString(input.aboutMe, fallback.aboutMe),
    coverLetter: {
      date: asString(coverLetter?.date, fallback.coverLetter.date),
      hiringManager: asString(
        coverLetter?.hiringManager,
        fallback.coverLetter.hiringManager
      ),
      companyAddress: asString(
        coverLetter?.companyAddress,
        fallback.coverLetter.companyAddress
      ),
      body: asString(coverLetter?.body, fallback.coverLetter.body),
      sendoff: asString(coverLetter?.sendoff, fallback.coverLetter.sendoff),
    },
    experience: normalizedExperience,
    projects: normalizedProjects,
    education: normalizedEducation,
    skills: normalizedSkills,
    hyperlinks: normalizedHyperlinks,
  };
};

type HyperlinkContextValue = {
  isPrintPreviewMode: boolean;
  isReadOnly: boolean;
  highlightPaths: Set<string>;
  impliedHighlightPaths: Set<string>;
  highlightTone: "before" | "after";
  hyperlinksByPath: Map<string, TextHyperlink[]>;
  hyperlinkUnderlineEnabled: boolean;
  onWholeFieldHyperlinkEditStart: (
    path: string,
    hyperlink: TextHyperlink
  ) => void;
  onWholeFieldHyperlinkEditEnd: (path: string) => void;
};

const HyperlinkContext = createContext<HyperlinkContextValue>({
  isPrintPreviewMode: false,
  isReadOnly: false,
  highlightPaths: new Set(),
  impliedHighlightPaths: new Set(),
  highlightTone: "after",
  hyperlinksByPath: new Map(),
  hyperlinkUnderlineEnabled: true,
  onWholeFieldHyperlinkEditStart: () => {},
  onWholeFieldHyperlinkEditEnd: () => {},
});

const isFieldPathHighlighted = (
  fieldPath: string | undefined,
  highlightPaths: Set<string>
) => {
  if (!fieldPath || highlightPaths.size === 0) return false;

  for (const path of highlightPaths) {
    if (!path) continue;
    if (fieldPath === path) return true;
    if (fieldPath.startsWith(`${path}.`) || fieldPath.startsWith(`${path}[`)) {
      return true;
    }
    if (path.startsWith(`${fieldPath}.`) || path.startsWith(`${fieldPath}[`)) {
      return true;
    }
  }
  return false;
};

const normalizeHyperlinkUrl = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const hasKnownPrefix = /^(https?:\/\/|mailto:|tel:)/i.test(trimmed);
  const emailLike = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  const candidate = hasKnownPrefix
    ? trimmed
    : emailLike
      ? `mailto:${trimmed}`
      : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    if (!["http:", "https:", "mailto:", "tel:"].includes(parsed.protocol)) {
      return null;
    }
    if (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      !parsed.hostname
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
};

const isHyperlinkRangeValid = (
  value: string,
  hyperlink: Pick<TextHyperlink, "start" | "end" | "text">
) => {
  if (!Number.isInteger(hyperlink.start) || !Number.isInteger(hyperlink.end)) {
    return false;
  }
  if (hyperlink.start < 0 || hyperlink.end <= hyperlink.start) {
    return false;
  }
  if (hyperlink.end > value.length) {
    return false;
  }
  return value.slice(hyperlink.start, hyperlink.end) === hyperlink.text;
};

const findTextChangeRange = (previousText: string, nextText: string) => {
  let start = 0;
  const maxPrefixLength = Math.min(previousText.length, nextText.length);
  while (
    start < maxPrefixLength &&
    previousText[start] === nextText[start]
  ) {
    start += 1;
  }

  let previousEnd = previousText.length;
  let nextEnd = nextText.length;
  while (
    previousEnd > start &&
    nextEnd > start &&
    previousText[previousEnd - 1] === nextText[nextEnd - 1]
  ) {
    previousEnd -= 1;
    nextEnd -= 1;
  }

  return { start, previousEnd, nextEnd };
};

const remapHyperlinkAfterTextChange = (
  hyperlink: TextHyperlink,
  previousText: string,
  nextText: string
): TextHyperlink | null => {
  const { start: changeStart, previousEnd, nextEnd } = findTextChangeRange(
    previousText,
    nextText
  );
  const insertedLength = nextEnd - changeStart;
  const removedLength = previousEnd - changeStart;
  const delta = insertedLength - removedLength;

  let nextStart = hyperlink.start;
  let nextHyperlinkEnd = hyperlink.end;

  if (removedLength === 0) {
    const insertionPoint = changeStart;
    if (insertionPoint < hyperlink.start) {
      nextStart += delta;
      nextHyperlinkEnd += delta;
    } else if (insertionPoint <= hyperlink.end) {
      nextHyperlinkEnd += delta;
    }
  } else if (previousEnd <= hyperlink.start) {
    nextStart += delta;
    nextHyperlinkEnd += delta;
  } else if (changeStart >= hyperlink.end) {
    // Change happened after the hyperlink range.
  } else if (
    changeStart <= hyperlink.start &&
    previousEnd >= hyperlink.end
  ) {
    if (insertedLength === 0) {
      return null;
    }
    nextStart = changeStart;
    nextHyperlinkEnd = nextEnd;
  } else if (changeStart <= hyperlink.start) {
    nextStart = changeStart;
    nextHyperlinkEnd = nextEnd + (hyperlink.end - previousEnd);
  } else if (previousEnd >= hyperlink.end) {
    nextHyperlinkEnd = changeStart + insertedLength;
  } else {
    nextHyperlinkEnd += delta;
  }

  nextStart = Math.max(0, Math.min(nextStart, nextText.length));
  nextHyperlinkEnd = Math.max(
    nextStart,
    Math.min(nextHyperlinkEnd, nextText.length)
  );
  if (nextHyperlinkEnd <= nextStart) {
    return null;
  }

  const nextHyperlinkText = nextText.slice(nextStart, nextHyperlinkEnd);
  if (!nextHyperlinkText) {
    return null;
  }

  return {
    ...hyperlink,
    start: nextStart,
    end: nextHyperlinkEnd,
    text: nextHyperlinkText,
  };
};

const remapHyperlinksForFieldChange = (
  hyperlinks: TextHyperlink[] | undefined,
  path: string,
  previousText: string,
  nextText: string
) => {
  const existing = Array.isArray(hyperlinks) ? hyperlinks : [];
  if (existing.length === 0 || previousText === nextText) {
    return existing;
  }

  const hyperlinksAtPath = existing.filter((hyperlink) => hyperlink.path === path);
  if (
    hyperlinksAtPath.length === 1 &&
    hyperlinksAtPath[0]?.start === 0 &&
    hyperlinksAtPath[0]?.end === previousText.length &&
    hyperlinksAtPath[0]?.text === previousText
  ) {
    const [wholeFieldHyperlink] = hyperlinksAtPath;
    const unaffectedHyperlinks = existing.filter(
      (hyperlink) => hyperlink.path !== path
    );

    return nextText
      ? [
          ...unaffectedHyperlinks,
          {
            ...wholeFieldHyperlink,
            start: 0,
            end: nextText.length,
            text: nextText,
          },
        ]
      : unaffectedHyperlinks;
  }

  return existing.flatMap((hyperlink) => {
    if (hyperlink.path !== path) {
      return [hyperlink];
    }

    const remapped = remapHyperlinkAfterTextChange(
      hyperlink,
      previousText,
      nextText
    );
    if (!remapped) {
      return [];
    }

    return [remapped];
  });
};

function EditableText({
  value,
  onChange,
  placeholder = "",
  className,
  style,
  multiline = false,
  fieldPath,
}: EditableTextProps) {
  const {
    isPrintPreviewMode,
    isReadOnly,
    highlightPaths,
    impliedHighlightPaths,
    highlightTone,
    hyperlinksByPath,
    hyperlinkUnderlineEnabled,
    onWholeFieldHyperlinkEditStart,
    onWholeFieldHyperlinkEditEnd,
  } =
    useContext(HyperlinkContext);
  const ref = useRef<HTMLSpanElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingWholeFieldHyperlink, setEditingWholeFieldHyperlink] =
    useState<TextHyperlink | null>(null);
  const normalizedValue = normalizeText(value, multiline);
  const fieldHyperlinks = useMemo(() => {
    if (!fieldPath) return [] as TextHyperlink[];
    return hyperlinksByPath.get(fieldPath) ?? [];
  }, [fieldPath, hyperlinksByPath]);
  const wholeFieldHyperlink = useMemo(() => {
    if (fieldHyperlinks.length !== 1) {
      return null;
    }

    const [hyperlink] = fieldHyperlinks;
    if (hyperlink.start !== 0 || hyperlink.end !== normalizedValue.length) {
      return null;
    }

    return hyperlink;
  }, [fieldHyperlinks, normalizedValue.length]);
  const isPrimaryHighlighted = useMemo(
    () => isFieldPathHighlighted(fieldPath, highlightPaths),
    [fieldPath, highlightPaths]
  );
  const isImpliedHighlighted = useMemo(
    () => isFieldPathHighlighted(fieldPath, impliedHighlightPaths),
    [fieldPath, impliedHighlightPaths]
  );
  const highlightState = isImpliedHighlighted
    ? "implied"
    : isPrimaryHighlighted
      ? "primary"
      : "none";
  const highlightClass = isImpliedHighlighted
    ? "rounded-[2px] bg-amber-200/45 ring-1 ring-amber-400/70 dark:bg-amber-500/20 dark:ring-amber-400/50"
    : isPrimaryHighlighted
      ? highlightTone === "before"
      ? "rounded-[2px] bg-amber-200/45 ring-1 ring-amber-400/70 dark:bg-amber-500/20 dark:ring-amber-400/50"
      : "rounded-[2px] bg-emerald-200/45 ring-1 ring-emerald-400/70 dark:bg-emerald-500/20 dark:ring-emerald-400/50"
      : "";

  const linkedSegments = useMemo(() => {
    if (fieldHyperlinks.length === 0) {
      return [{ id: "plain-0", text: normalizedValue, url: null as string | null }];
    }
    const segments: Array<{ id: string; text: string; url: string | null }> = [];
    const sorted = [...fieldHyperlinks].sort((a, b) => a.start - b.start);
    let cursor = 0;

    for (const hyperlink of sorted) {
      if (hyperlink.start > cursor) {
        segments.push({
          id: `plain-${cursor}`,
          text: normalizedValue.slice(cursor, hyperlink.start),
          url: null,
        });
      }
      segments.push({
        id: hyperlink.id,
        text: normalizedValue.slice(hyperlink.start, hyperlink.end),
        url: hyperlink.url,
      });
      cursor = hyperlink.end;
    }

    if (cursor < normalizedValue.length) {
      segments.push({
        id: `plain-${cursor}`,
        text: normalizedValue.slice(cursor),
        url: null,
      });
    }

    return segments.filter((segment) => segment.text.length > 0);
  }, [fieldHyperlinks, normalizedValue]);

  const hasLinkedSegments = linkedSegments.some((segment) => Boolean(segment.url));
  const linkedRenderKey = useMemo(
    () =>
      fieldHyperlinks
        .map(
          (hyperlink) =>
            `${hyperlink.id}:${hyperlink.start}:${hyperlink.end}:${hyperlink.url}`
        )
        .join("|"),
    [fieldHyperlinks]
  );

  useEffect(() => {
    if (!ref.current) return;
    const isFocused =
      typeof document !== "undefined" && document.activeElement === ref.current;

    if (!isFocused && ref.current.textContent !== normalizedValue) {
      ref.current.textContent = normalizedValue;
    }
  }, [normalizedValue]);

  useEffect(() => {
    if (!isEditing || !ref.current) return;
    ref.current.focus();
  }, [isEditing]);

  const beginEditing = () => {
    setIsEditing(true);
    setEditingWholeFieldHyperlink(wholeFieldHyperlink);
    if (fieldPath && wholeFieldHyperlink) {
      onWholeFieldHyperlinkEditStart(fieldPath, wholeFieldHyperlink);
    }
  };

  const finishEditing = () => {
    setIsEditing(false);
    setEditingWholeFieldHyperlink(null);
    if (fieldPath) {
      onWholeFieldHyperlinkEditEnd(fieldPath);
    }
  };

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

  if (hasLinkedSegments && !isEditing) {
    return (
      <span
        key={`linked-${fieldPath ?? "field"}-${linkedRenderKey}`}
        className={cn(
          "editable-field",
          multiline
            ? "block whitespace-pre-line break-words"
            : "inline-block max-w-full break-words align-baseline",
          highlightClass,
          className
        )}
        style={style}
        data-field-path={fieldPath}
        data-highlight-state={highlightState}
        data-placeholder={placeholder}
        role="textbox"
        aria-label={placeholder || "Editable text"}
        tabIndex={isPrintPreviewMode || isReadOnly ? -1 : 0}
        onDoubleClick={() => {
          if (isPrintPreviewMode || isReadOnly) return;
          beginEditing();
        }}
        onKeyDown={(event) => {
          if (isPrintPreviewMode || isReadOnly) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            beginEditing();
          }
        }}
      >
        {linkedSegments.map((segment) =>
          segment.url ? (
            <a
              key={segment.id}
              href={segment.url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "resume-inline-link underline-offset-2",
                hyperlinkUnderlineEnabled
                  ? "underline decoration-gray-500/70"
                  : "no-underline"
              )}
              onClick={(event) => {
                if (!isPrintPreviewMode) {
                  event.preventDefault();
                }
              }}
            >
              {segment.text}
            </a>
          ) : (
            <Fragment key={segment.id}>{segment.text}</Fragment>
          )
        )}
      </span>
    );
  }

  return (
    <span
      key={`editable-${fieldPath ?? "field"}`}
      ref={ref}
      className={cn(
        "editable-field",
        multiline
          ? "block whitespace-pre-line break-words"
          : "inline-block max-w-full break-words align-baseline",
        editingWholeFieldHyperlink &&
          (hyperlinkUnderlineEnabled
            ? "underline decoration-gray-500/70 underline-offset-2"
            : "no-underline"),
        highlightClass,
        className
      )}
      style={style}
      contentEditable={!isPrintPreviewMode && !isReadOnly}
      suppressContentEditableWarning
      data-field-path={fieldPath}
      data-highlight-state={highlightState}
      data-placeholder={placeholder}
      onInput={isPrintPreviewMode || isReadOnly ? undefined : commit}
      onBlur={() => {
        if (!isPrintPreviewMode && !isReadOnly) {
          commit();
        }
        finishEditing();
      }}
      onFocus={() => {
        if (!isPrintPreviewMode && !isReadOnly && !isEditing) {
          beginEditing();
        }
      }}
      onKeyDown={handleKeyDown}
      onPaste={isPrintPreviewMode || isReadOnly ? undefined : handlePaste}
      role="textbox"
      aria-label={placeholder || "Editable text"}
      tabIndex={isPrintPreviewMode || isReadOnly ? -1 : 0}
      spellCheck={!isPrintPreviewMode && !isReadOnly}
    />
  );
}

interface InlineAiAssistProps {
  isOpen: boolean;
  onToggle: () => void;
  className?: string;
  triggerClassName?: string;
  ariaLabel?: string;
}

function InlineAiAssist({
  isOpen,
  onToggle,
  className,
  triggerClassName,
  ariaLabel = "AI suggestions",
}: InlineAiAssistProps) {
  return (
    <div className={cn("relative", className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(
          "h-5 w-5 text-muted-foreground hover:text-foreground",
          triggerClassName
        )}
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        aria-label={ariaLabel}
        aria-pressed={isOpen}
      >
        <Sparkles className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

interface ReplacementEditorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

function ReplacementEditor({
  value,
  onChange,
  className,
}: ReplacementEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = "auto";
    ref.current.style.height = `${ref.current.scrollHeight}px`;
  }, [value]);

  return (
    <Textarea
      ref={ref}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      rows={2}
      className={cn("min-h-[64px] resize-none text-[11px]", className)}
    />
  );
}

type FieldFeedback = ResumeAnalysisState["fieldFeedback"][number];

type HyperlinkSelection = {
  path: string;
  start: number;
  end: number;
  text: string;
  rect: DOMRect;
};

type SelectedFieldMetrics = {
  availableWidthPx: number;
  fontSizePx: number;
  fontFamily: string;
  charWidthPx: number;
  safetyBuffer: number;
};

type SelectedField = {
  path: string;
  text: string;
  metrics?: SelectedFieldMetrics;
};

type BulkOperation = {
  id: string;
  op: "replace" | "delete" | "insert";
  path: string;
  value: string;
  index: number;
  itemType:
    | "text"
    | "bullet"
    | "technology"
    | "experience"
    | "project"
    | "education"
    | "skill"
    | "none";
};

type InlineRewriteResponse = {
  replacement?: string;
  error?: string;
};

type SelectionRewriteResponse = {
  operations?: Array<Omit<BulkOperation, "id">>;
  error?: string;
};

const MAX_LINES_OPTIONS = [1, 2, 3, 4, 5, 6] as const;

const SECTION_LABELS: Record<SectionKey, string> = {
  summary: "Summary",
  experience: "Experience",
  projects: "Projects",
  education: "Education",
  skills: "Skills",
};

const getRawTextValueAtPath = (data: ResumeData, path: string): string => {
  const segments = parseFieldPath(path);
  let cursor: any = data;
  for (const segment of segments) {
    if (cursor == null) return "";
    cursor = cursor[segment as keyof typeof cursor];
  }
  if (typeof cursor === "string") return cursor;
  if (
    Array.isArray(cursor) &&
    path.endsWith(".technologies") &&
    cursor.every((item) => typeof item === "string")
  ) {
    return cursor.join(", ");
  }
  return "";
};

const isMultilineFieldPath = (path: string) => path === "metadata.summary";

const getRenderedTextValueAtPath = (data: ResumeData, path: string): string =>
  normalizeText(getRawTextValueAtPath(data, path), isMultilineFieldPath(path));

interface QualityIndicatorProps {
  feedback?: FieldFeedback;
  path: string;
  onApplySuggestion: (
    path: string,
    suggestionId: string,
    replacement: string
  ) => void;
  className?: string;
}

function QualityIndicator({
  feedback,
  path,
  onApplySuggestion,
  className,
}: QualityIndicatorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const closeTimeoutRef = useRef<number | null>(null);
  const [replacementDrafts, setReplacementDrafts] = useState<
    Record<string, string>
  >({});

  const updateReplacement = (suggestionId: string, value: string) => {
    setReplacementDrafts((current) => ({
      ...current,
      [suggestionId]: value,
    }));
  };

  const applySuggestion = (
    suggestion: FieldFeedback["improvementSuggestions"][number],
    replacement: string
  ) => {
    const trimmed = replacement.trim();
    if (!trimmed) return;
    onApplySuggestion(path, suggestion.id, trimmed);
    setIsOpen(false);
  };

  const clearCloseTimer = () => {
    if (closeTimeoutRef.current) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const openPanel = () => {
    clearCloseTimer();
    setIsOpen(true);
  };

  const scheduleClose = () => {
    clearCloseTimer();
    closeTimeoutRef.current = window.setTimeout(() => {
      setIsOpen(false);
    }, 160);
  };

  useEffect(() => {
    return () => clearCloseTimer();
  }, []);

  if (!feedback || feedback.quality !== "needs improvement") {
    return null;
  }

  return (
    <div
      className={cn("relative inline-flex items-center print:hidden", className)}
      onFocus={() => openPanel()}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          scheduleClose();
        }
      }}
      tabIndex={-1}
    >
      <button
        type="button"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-amber-300 bg-amber-50 text-amber-600 shadow-sm transition hover:bg-amber-100"
        aria-label="Needs improvement"
        onMouseEnter={openPanel}
        onMouseLeave={scheduleClose}
        onFocus={openPanel}
      >
        <AlertCircle className="h-3 w-3" />
      </button>
      {isOpen && (
        <div
          className="absolute right-0 top-full z-30 mt-2 w-72 rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-xl"
          onMouseEnter={openPanel}
          onMouseLeave={scheduleClose}
        >
          <div className="space-y-2">
            <p className="text-[11px] font-medium text-foreground">
              Needs improvement
            </p>
            {feedback.improvementSuggestions.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                No suggestions available yet.
              </p>
            ) : (
              <div className="space-y-3">
                {feedback.improvementSuggestions.map((suggestion) => {
                  const effectiveValues = suggestion.requiredInputs.reduce(
                    (acc, input) => {
                      const value = input.placeholder ?? "";
                      acc[input.key] = value;
                      return acc;
                    },
                    {} as Record<string, string>
                  );
                  const defaultReplacement = suggestion.recommendedReplacement
                    ? applyReplacementTemplate(
                        suggestion.recommendedReplacement,
                        effectiveValues
                      ).trim()
                    : "";
                  const replacementDraft =
                    replacementDrafts[suggestion.id] ?? defaultReplacement;
                  const canApply = Boolean(replacementDraft?.trim());

                  return (
                    <div
                      key={suggestion.id}
                      className="rounded-md border border-border/60 bg-background/80 p-2"
                    >
                      <p className="text-[11px] font-medium text-foreground">
                        {suggestion.issue}
                      </p>
                      {suggestion.requiresUserInput &&
                        suggestion.requiredInputs.length > 0 && (
                          <p className="mt-2 text-[10px] text-muted-foreground">
                            Needs:{" "}
                            {suggestion.requiredInputs
                              .map((input) => input.label)
                              .join(", ")}
                          </p>
                        )}
                      {suggestion.recommendedReplacement ? (
                        <div className="mt-2">
                          <div className="text-[10px] text-muted-foreground">
                            Replacement
                          </div>
                          <ReplacementEditor
                            value={replacementDraft}
                            onChange={(value) =>
                              updateReplacement(suggestion.id, value)
                            }
                            className="mt-1"
                          />
                        </div>
                      ) : (
                        <p className="mt-2 text-[10px] text-muted-foreground">
                          No replacement available.
                        </p>
                      )}
                      <div className="mt-2 flex items-center justify-between">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                          onClick={() =>
                            updateReplacement(suggestion.id, defaultReplacement)
                          }
                          disabled={!defaultReplacement}
                        >
                          Reset to suggested
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-7 text-[11px]"
                          onClick={() =>
                            applySuggestion(suggestion, replacementDraft ?? "")
                          }
                          disabled={!canApply}
                        >
                          Apply change
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function ResumeViewer({
  resumeData,
  onResumeUpdate,
  analysis,
  onApplySuggestion,
  maxResumePages,
  onPageCountChange,
  debugData,
  onApplyDebugChanges,
  readOnly = false,
  allowCoverLetterTabInReadOnly = false,
  autoScaleToFit = false,
  documentTab,
  onDocumentTabChange,
  documentTabControl = "tabs",
  toolbarActionsSlot,
  showToolbarActionsInReadOnly = false,
  onToolbarActionsReady,
  onToolbarStateChange,
  highlightFieldPaths,
  impliedHighlightFieldPaths,
  highlightTone = "after",
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
  const [isPrintPreviewMode, setIsPrintPreviewMode] = useState(
    Boolean(readOnly)
  );
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [activeDocumentTab, setActiveDocumentTab] = useState<
    "resume" | "cover-letter"
  >("resume");
  const resolvedDocumentTab = documentTab ?? activeDocumentTab;
  const isDocumentTabControlled = typeof documentTab !== "undefined";
  const highlightPathSet = useMemo(
    () => new Set((highlightFieldPaths ?? []).filter(Boolean)),
    [highlightFieldPaths]
  );
  const impliedHighlightPathSet = useMemo(
    () => new Set((impliedHighlightFieldPaths ?? []).filter(Boolean)),
    [impliedHighlightFieldPaths]
  );

  const canShowCoverLetterTab = !readOnly || allowCoverLetterTabInReadOnly;
  const shouldShowDocumentControl =
    documentTabControl !== "none" && canShowCoverLetterTab;
  const shouldShowToolbarActions = !readOnly || showToolbarActionsInReadOnly;
  const shouldShowTopBar =
    shouldShowDocumentControl ||
    shouldShowToolbarActions ||
    Boolean(toolbarActionsSlot);

  useEffect(() => {
    if (!readOnly) return;
    setIsPrintPreviewMode(true);
    if (!allowCoverLetterTabInReadOnly && !isDocumentTabControlled) {
      setActiveDocumentTab("resume");
    }
  }, [allowCoverLetterTabInReadOnly, isDocumentTabControlled, readOnly]);

  const handleDocumentTabChange = useCallback(
    (nextTab: "resume" | "cover-letter") => {
      if (readOnly && !allowCoverLetterTabInReadOnly) return;
      if (!isDocumentTabControlled) {
        setActiveDocumentTab(nextTab);
      }
      onDocumentTabChange?.(nextTab);
    },
    [
      allowCoverLetterTabInReadOnly,
      isDocumentTabControlled,
      onDocumentTabChange,
      readOnly,
    ]
  );

  const feedbackMap = useMemo(() => {
    if (!analysis?.fieldFeedback) {
      return new Map<string, FieldFeedback>();
    }
    return new Map(
      analysis.fieldFeedback.map((entry) => [entry.path, entry])
    );
  }, [analysis]);

  const pickFeedback = useCallback((paths: string | string[]) => {
    const list = Array.isArray(paths) ? paths : [paths];
    for (const path of list) {
      const feedback = feedbackMap.get(path);
      if (feedback?.quality === "needs improvement") {
        return { path, feedback };
      }
    }
    return null;
  }, [feedbackMap]);

  const renderWithFeedback = useCallback(
    (
      paths: string | string[],
      node: ReactNode,
      options?: {
        wrapperClassName?: string;
        indicatorClassName?: string;
        wrapperElement?: "span" | "div";
      }
    ) => {
      if (isPrintPreviewMode) return node;
      const match = pickFeedback(paths);
      if (!match) return node;
      const Wrapper = options?.wrapperElement ?? "span";
      return (
        <Wrapper
          className={cn(
            "relative inline-flex items-start gap-1",
            options?.wrapperClassName
          )}
        >
          {node}
          <QualityIndicator
            feedback={match.feedback}
            path={match.path}
            onApplySuggestion={onApplySuggestion}
            className={options?.indicatorClassName}
          />
        </Wrapper>
      );
    },
    [isPrintPreviewMode, onApplySuggestion, pickFeedback]
  );

  const resolvedLayoutPreferences = useMemo(
    () => ({
      ...DEFAULT_LAYOUT_PREFERENCES,
      ...layoutPreferences,
      hyperlinkUnderline:
        layoutPreferences?.hyperlinkUnderline ??
        DEFAULT_LAYOUT_PREFERENCES.hyperlinkUnderline,
      contactOrder:
        layoutPreferences?.contactOrder ?? DEFAULT_LAYOUT_PREFERENCES.contactOrder,
      headerAlignment: {
        ...DEFAULT_LAYOUT_PREFERENCES.headerAlignment,
        ...layoutPreferences?.headerAlignment,
      },
      fontPreferences: {
        ...DEFAULT_LAYOUT_PREFERENCES.fontPreferences,
        ...layoutPreferences?.fontPreferences,
        family: normalizeFontFamily(
          layoutPreferences?.fontPreferences?.family,
          DEFAULT_LAYOUT_PREFERENCES.fontPreferences.family
        ),
        sizes: {
          ...DEFAULT_LAYOUT_PREFERENCES.fontPreferences.sizes,
          ...layoutPreferences?.fontPreferences?.sizes,
        },
      },
      coverLetterFontPreferences: {
        ...DEFAULT_LAYOUT_PREFERENCES.coverLetterFontPreferences,
        ...layoutPreferences?.coverLetterFontPreferences,
        family: normalizeFontFamily(
          layoutPreferences?.coverLetterFontPreferences?.family,
          DEFAULT_LAYOUT_PREFERENCES.coverLetterFontPreferences.family
        ),
        sizes: {
          ...DEFAULT_LAYOUT_PREFERENCES.coverLetterFontPreferences.sizes,
          ...layoutPreferences?.coverLetterFontPreferences?.sizes,
        },
      },
      spacing: {
        ...DEFAULT_LAYOUT_PREFERENCES.spacing,
        ...layoutPreferences?.spacing,
      },
    }),
    [layoutPreferences]
  );

  const resolvedPageSettings = useMemo(() => {
    const legacyMargins =
      pageSettings?.margins ?? DEFAULT_PAGE_SETTINGS.resumeMargins;
    const legacyPreset =
      pageSettings?.marginPreset ?? DEFAULT_PAGE_SETTINGS.resumeMarginPreset;

    return {
      paperSize: pageSettings?.paperSize ?? DEFAULT_PAGE_SETTINGS.paperSize,
      resumeMargins: pageSettings?.resumeMargins ?? legacyMargins,
      resumeMarginPreset: pageSettings?.resumeMarginPreset ?? legacyPreset,
      coverLetterMargins: pageSettings?.coverLetterMargins ?? legacyMargins,
      coverLetterMarginPreset:
        pageSettings?.coverLetterMarginPreset ?? legacyPreset,
    };
  }, [pageSettings]);

  const getPaperStyleFromMargins = useCallback((margins: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  }) => {
    const { width, height } = PAPER_DIMENSIONS[resolvedPageSettings.paperSize];

    // CSS percentage padding resolves against the element width on both axes.
    // Use paper width for every side so the rendered content box matches the
    // pagination math and the exported print layout.
    const marginTopPercent = (margins.top / width) * 100;
    const marginRightPercent = (margins.right / width) * 100;
    const marginBottomPercent = (margins.bottom / width) * 100;
    const marginLeftPercent = (margins.left / width) * 100;

    return {
      aspectRatio: `${width} / ${height}`,
      padding: `${marginTopPercent}% ${marginRightPercent}% ${marginBottomPercent}% ${marginLeftPercent}%`,
    };
  }, [resolvedPageSettings.paperSize]);

  const resumePaperStyle = useMemo(
    () => getPaperStyleFromMargins(resolvedPageSettings.resumeMargins),
    [getPaperStyleFromMargins, resolvedPageSettings.resumeMargins]
  );

  const coverLetterPaperStyle = useMemo(
    () => getPaperStyleFromMargins(resolvedPageSettings.coverLetterMargins),
    [getPaperStyleFromMargins, resolvedPageSettings.coverLetterMargins]
  );

  const paperMetrics = useMemo(() => {
    const { width, height } = PAPER_DIMENSIONS[resolvedPageSettings.paperSize];
    const pxPerMm = 72 / 25.4;
    return {
      paperWidthPx: width * pxPerMm,
      paperHeightPx: height * pxPerMm,
      paperMaxWidth: `${width * pxPerMm}px`,
    };
  }, [resolvedPageSettings.paperSize]);

  const hyperlinksByPath = useMemo(() => {
    const grouped = new Map<string, TextHyperlink[]>();
    const rawHyperlinks = Array.isArray(resumeData.hyperlinks)
      ? resumeData.hyperlinks
      : [];

    for (const hyperlink of rawHyperlinks) {
      const safeUrl = normalizeHyperlinkUrl(hyperlink.url);
      if (!safeUrl) continue;

      const text = getRenderedTextValueAtPath(resumeData, hyperlink.path);
      if (!text) continue;
      if (!isHyperlinkRangeValid(text, hyperlink)) continue;

      const normalizedHyperlink: TextHyperlink = {
        ...hyperlink,
        url: safeUrl,
      };
      const current = grouped.get(hyperlink.path) ?? [];
      current.push(normalizedHyperlink);
      grouped.set(hyperlink.path, current);
    }

    for (const [path, links] of grouped.entries()) {
      const sorted = [...links].sort((a, b) => {
        if (a.start !== b.start) return a.start - b.start;
        return a.end - b.end;
      });
      const filtered: TextHyperlink[] = [];
      let cursor = -1;
      for (const link of sorted) {
        if (link.start < cursor) continue;
        filtered.push(link);
        cursor = link.end;
      }
      grouped.set(path, filtered);
    }

    return grouped;
  }, [resumeData]);

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

  const [activeAiTarget, setActiveAiTarget] = useState<string | null>(null);
  const [selectionState, setSelectionState] = useState<{
    fields: SelectedField[];
    rect: DOMRect;
  } | null>(null);
  const [hyperlinkSelection, setHyperlinkSelection] =
    useState<HyperlinkSelection | null>(null);
  const [isHyperlinkPanelOpen, setIsHyperlinkPanelOpen] = useState(false);
  const [hyperlinkDraft, setHyperlinkDraft] = useState("");
  const [hyperlinkError, setHyperlinkError] = useState<string | null>(null);
  const [bulkFields, setBulkFields] = useState<SelectedField[]>([]);
  const [bulkOps, setBulkOps] = useState<BulkOperation[]>([]);
  const [bulkPrompt, setBulkPrompt] = useState("");
  const [bulkTargetLabel, setBulkTargetLabel] = useState("");
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkMaxLines, setBulkMaxLines] = useState(0);
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [isBulkCollapsed, setIsBulkCollapsed] = useState(false);
  const [bulkScope, setBulkScope] = useState<{
    type: "selection" | "section";
    section?: SectionKey;
  }>({ type: "selection" });
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const [activeDebugTab, setActiveDebugTab] = useState<
    "resume-json" | "llm-raw"
  >("resume-json");
  const [didCopyDebugJson, setDidCopyDebugJson] = useState(false);
  const [didApplyDebugJson, setDidApplyDebugJson] = useState(false);
  const [debugReplaceError, setDebugReplaceError] = useState<string | null>(null);
  const resumeDebugJson = useMemo(() => {
    try {
      return JSON.stringify(resumeData, null, 2);
    } catch {
      return "";
    }
  }, [resumeData]);
  const [resumeDebugJsonDraft, setResumeDebugJsonDraft] = useState(resumeDebugJson);
  const rawDebugJson = useMemo(() => {
    const source = debugData ?? analysis?.raw;
    if (!source) return "";
    try {
      return JSON.stringify(source, null, 2);
    } catch {
      return String(source);
    }
  }, [analysis, debugData]);
  const activeDebugJson =
    activeDebugTab === "resume-json" ? resumeDebugJsonDraft : rawDebugJson;
  const resumeContentRef = useRef<HTMLDivElement>(null);
  const resumeViewportRef = useRef<HTMLDivElement>(null);
  const coverLetterViewportRef = useRef<HTMLDivElement>(null);
  const editingWholeFieldHyperlinksRef = useRef(new Map<string, TextHyperlink>());
  const resumePaginationRecalculateRef = useRef<(() => void) | null>(null);
  const coverLetterPaginationRecalculateRef = useRef<(() => void) | null>(null);
  const charMeasureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [resumeViewportWidth, setResumeViewportWidth] = useState(0);
  const [coverLetterViewportWidth, setCoverLetterViewportWidth] = useState(0);
  const bulkPanelTop = isDebugOpen ? 120 : 60;

  useEffect(() => {
    if (!autoScaleToFit) return;
    const node = resumeViewportRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setResumeViewportWidth(width);
    });
    observer.observe(node);
    setResumeViewportWidth(node.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, [autoScaleToFit, resolvedDocumentTab]);

  useEffect(() => {
    if (!autoScaleToFit) return;
    const node = coverLetterViewportRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setCoverLetterViewportWidth(width);
    });
    observer.observe(node);
    setCoverLetterViewportWidth(node.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, [autoScaleToFit, resolvedDocumentTab]);

  useEffect(() => {
    if (!isPrintPreviewMode) return;
    setIsBulkOpen(false);
    setSelectionState(null);
    setHyperlinkSelection(null);
    setIsHyperlinkPanelOpen(false);
    setHyperlinkDraft("");
    setHyperlinkError(null);
    setActiveAiTarget(null);
  }, [isPrintPreviewMode]);

  useEffect(() => {
    if (!didCopyDebugJson) return;
    const timeoutId = window.setTimeout(() => {
      setDidCopyDebugJson(false);
    }, 1200);
    return () => window.clearTimeout(timeoutId);
  }, [didCopyDebugJson]);

  useEffect(() => {
    if (!didApplyDebugJson) return;
    const timeoutId = window.setTimeout(() => {
      setDidApplyDebugJson(false);
    }, 1200);
    return () => window.clearTimeout(timeoutId);
  }, [didApplyDebugJson]);

  const applyDebugResumeJson = useCallback(() => {
    if (readOnly) {
      setDebugReplaceError("Debug JSON replacement is disabled in read-only mode.");
      setDidApplyDebugJson(false);
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(resumeDebugJsonDraft);
    } catch {
      setDebugReplaceError("Invalid JSON. Fix syntax errors and try again.");
      setDidApplyDebugJson(false);
      return;
    }

    const normalized = normalizeResumeFromDebugInput(
      parsed,
      DEFAULT_RESUME_DATA
    );
    if (!normalized) {
      setDebugReplaceError("Invalid resume JSON payload.");
      setDidApplyDebugJson(false);
      return;
    }

    onResumeUpdate(normalized);
    setResumeDebugJsonDraft(JSON.stringify(normalized, null, 2));
    setDebugReplaceError(null);
    setDidApplyDebugJson(true);
    setDidCopyDebugJson(false);
  }, [onResumeUpdate, readOnly, resumeDebugJsonDraft]);

  const copyDebugJson = useCallback(async () => {
    if (!activeDebugJson) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(activeDebugJson);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = activeDebugJson;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setDidCopyDebugJson(true);
    } catch (error) {
      console.error("Failed to copy debug JSON:", error);
      setDidCopyDebugJson(false);
    }
  }, [activeDebugJson]);

  const exportResumeAsPdf = useCallback(async () => {
    if (typeof window === "undefined") return;
    const wasInPrintPreview = isPrintPreviewMode;
    setIsExportingPdf(true);

    try {
      const waitForResumeLayoutToSettle = async (target: HTMLElement) => {
        await new Promise<void>((resolve) => {
          let finished = false;
          let quietTimer: number | null = null;
          let hardTimer: number | null = null;
          const observer = new MutationObserver(() => {
            if (quietTimer !== null) {
              window.clearTimeout(quietTimer);
            }
            quietTimer = window.setTimeout(finish, 220);
          });

          const cleanup = () => {
            observer.disconnect();
            if (quietTimer !== null) {
              window.clearTimeout(quietTimer);
            }
            if (hardTimer !== null) {
              window.clearTimeout(hardTimer);
            }
          };

          function finish() {
            if (finished) return;
            finished = true;
            cleanup();
            resolve();
          }

          observer.observe(target, {
            subtree: true,
            childList: true,
            attributes: true,
            characterData: true,
          });

          quietTimer = window.setTimeout(finish, 220);
          hardTimer = window.setTimeout(finish, 1800);
        });

        await new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => resolve());
          });
        });
      };

      if (!wasInPrintPreview) {
        setIsPrintPreviewMode(true);
        await new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => resolve());
          });
        });
      }

      const container = resumeContentRef.current;
      if (!container) return;
      resumePaginationRecalculateRef.current?.();
      await waitForResumeLayoutToSettle(container);
      resumePaginationRecalculateRef.current?.();
      await new Promise<void>((resolve) => window.setTimeout(resolve, 120));

      const pages = Array.from(
        container.querySelectorAll<HTMLElement>(".document-paper")
      );
      if (pages.length === 0) return;

      const printWindow = window.open("", "_blank");
      if (!printWindow) return;

      const { width, height } = PAPER_DIMENSIONS[resolvedPageSettings.paperSize];
      const styleTags = Array.from(
        document.querySelectorAll('style, link[rel="stylesheet"]')
      )
        .map((node) => node.outerHTML)
        .join("\n");

      const previewPxPerMm = 72 / 25.4;
      const printPxPerMm = 96 / 25.4;
      const printScale = printPxPerMm / previewPxPerMm;
      const previewPaperWidthPx = width * previewPxPerMm;
      const previewPaperHeightPx = height * previewPxPerMm;

      const pageHtml = pages
        .map(
          (page, index) => `
            <section class="export-page${index === pages.length - 1 ? "" : " page-break"}">
              <div class="export-page-inner">
                ${page.outerHTML}
              </div>
            </section>
          `
        )
        .join("");

      const baseName =
        metadata.fullName
          ?.trim()
          .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
          .replace(/\s+/g, "-")
          .toLowerCase() || "resume";

      printWindow.document.open();
      printWindow.document.write(`
        <!doctype html>
        <html class="${document.documentElement.className}">
          <head>
            <meta charset="utf-8" />
            <title>${baseName}.pdf</title>
            ${styleTags}
            <style>
              @page {
                size: ${width}mm ${height}mm;
                margin: 0;
              }

              html,
              body {
                margin: 0;
                padding: 0;
                background: #fff !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }

              .pdf-export-root {
                margin: 0 auto;
                width: ${width}mm;
              }

              .pdf-export-root,
              .pdf-export-root * {
                font-variant-ligatures: none !important;
                font-feature-settings: "liga" 0, "clig" 0, "calt" 0 !important;
              }

              .export-page {
                width: ${width}mm;
                height: ${height}mm;
                overflow: hidden;
              }

              .export-page-inner {
                width: ${previewPaperWidthPx}px;
                height: ${previewPaperHeightPx}px;
                transform: scale(${printScale});
                transform-origin: top left;
              }

              .export-page .document-paper {
                width: ${previewPaperWidthPx}px !important;
                min-height: ${previewPaperHeightPx}px !important;
                height: ${previewPaperHeightPx}px !important;
                margin: 0 !important;
                box-shadow: none !important;
                border: none !important;
                border-radius: 0 !important;
                overflow: hidden !important;
              }

              .export-page .editable-field[data-highlight-state="primary"],
              .export-page .editable-field[data-highlight-state="implied"] {
                background: transparent !important;
                box-shadow: none !important;
                border-radius: 0 !important;
              }

              .print-preview-mode .editable-field:empty::before,
              .export-page .editable-field:empty::before,
              .export-page .editable-field[data-placeholder]::before {
                content: "" !important;
              }

              .export-page.page-break {
                break-after: page;
                page-break-after: always;
              }
            </style>
          </head>
          <body class="print-preview-mode">
            <main class="pdf-export-root">
              ${pageHtml}
            </main>
            <script>
              (() => {
                const startPrint = async () => {
                  if (document.fonts?.ready) {
                    try {
                      await document.fonts.ready;
                    } catch {}
                  }

                  window.setTimeout(() => {
                    window.focus();
                    window.print();
                  }, 150);
                };

                if (document.readyState === "complete") {
                  startPrint();
                } else {
                  window.addEventListener("load", startPrint, { once: true });
                }

                window.addEventListener("afterprint", () => {
                  window.close();
                });
              })();
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    } finally {
      if (!wasInPrintPreview) {
        setIsPrintPreviewMode(false);
      }
      setIsExportingPdf(false);
    }
  }, [
    isPrintPreviewMode,
    metadata.fullName,
    resolvedPageSettings.paperSize,
  ]);

  const handleSetPrintPreviewMode = useCallback((enabled: boolean) => {
    setIsPrintPreviewMode(enabled);
  }, []);

  const handleTogglePrintPreview = useCallback(() => {
    setIsPrintPreviewMode((current) => !current);
  }, []);

  const handleSetDebugOpen = useCallback((open: boolean) => {
    setIsDebugOpen(open);
    if (open) {
      setActiveDebugTab("resume-json");
      setResumeDebugJsonDraft(resumeDebugJson);
      setDebugReplaceError(null);
      setDidApplyDebugJson(false);
      setDidCopyDebugJson(false);
    }
  }, [resumeDebugJson]);

  const handleToggleDebug = useCallback(() => {
    setIsDebugOpen((current) => {
      const next = !current;
      if (next) {
        setActiveDebugTab("resume-json");
        setResumeDebugJsonDraft(resumeDebugJson);
        setDebugReplaceError(null);
        setDidApplyDebugJson(false);
        setDidCopyDebugJson(false);
      }
      return next;
    });
  }, [resumeDebugJson]);

  useEffect(() => {
    onToolbarActionsReady?.({
      exportPdf: exportResumeAsPdf,
      togglePrintPreview: handleTogglePrintPreview,
      toggleDebug: handleToggleDebug,
      setPrintPreviewMode: handleSetPrintPreviewMode,
      setDebugOpen: handleSetDebugOpen,
    });
  }, [
    exportResumeAsPdf,
    handleSetDebugOpen,
    handleSetPrintPreviewMode,
    handleToggleDebug,
    handleTogglePrintPreview,
    onToolbarActionsReady,
  ]);

  useEffect(() => {
    onToolbarStateChange?.({
      isPrintPreviewMode,
      isDebugOpen,
      isExportingPdf,
    });
  }, [
    isDebugOpen,
    isExportingPdf,
    isPrintPreviewMode,
    onToolbarStateChange,
  ]);

  const clearSelectionState = () => {
    setSelectionState(null);
    setHyperlinkSelection(null);
    setIsHyperlinkPanelOpen(false);
    setHyperlinkDraft("");
    setHyperlinkError(null);
  };

  const openBulkPanel = useCallback((options: {
    fields: SelectedField[];
    targetLabel: string;
    scope: { type: "selection" | "section"; section?: SectionKey };
    activeTargetKey?: string | null;
    prompt?: string;
    maxLines?: number;
  }) => {
    setBulkFields(options.fields);
    setBulkTargetLabel(options.targetLabel);
    setBulkPrompt(options.prompt ?? "");
    setBulkMaxLines(options.maxLines ?? 0);
    setBulkOps([]);
    setBulkError(null);
    setBulkScope(options.scope);
    setIsBulkCollapsed(false);
    setIsBulkOpen(true);
    setIsHyperlinkPanelOpen(false);
    setHyperlinkError(null);
    setActiveAiTarget(options.activeTargetKey ?? null);
  }, []);

  const getFallbackContentWidthPx = useCallback(() => {
    const paper = PAPER_DIMENSIONS[resolvedPageSettings.paperSize];
    const contentWidthMm =
      paper.width -
      resolvedPageSettings.resumeMargins.left -
      resolvedPageSettings.resumeMargins.right;
    const pxPerMm = 72 / 25.4;
    return contentWidthMm * pxPerMm;
  }, [
    resolvedPageSettings.paperSize,
    resolvedPageSettings.resumeMargins.left,
    resolvedPageSettings.resumeMargins.right,
  ]);

  const parsePxValue = (rawValue: string): number => {
    if (!rawValue || rawValue === "normal") return 0;
    const parsed = Number.parseFloat(rawValue);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const measureCharWidth = useCallback(
    (options: {
      element: HTMLElement;
      text: string;
      fontShorthand: string;
      fontFamily: string;
      fontSizePx: number;
      lineHeightPx: number;
      letterSpacingPx: number;
    }) => {
      const {
        element,
        text,
        fontShorthand,
        fontFamily,
        fontSizePx,
        lineHeightPx,
        letterSpacingPx,
      } = options;
      if (typeof document === "undefined") return 8;
      if (!charMeasureCanvasRef.current) {
        charMeasureCanvasRef.current = document.createElement("canvas");
      }
      const context = charMeasureCanvasRef.current.getContext("2d");
      if (!context) return 8;
      context.font = fontShorthand;
      const sample =
        "the quick brown fox jumps over the lazy dog and ships stable features ";
      const measuredSampleWidth = context.measureText(sample).width / sample.length;

      const normalizedFamily = fontFamily.toLowerCase();
      const heuristicRatio = normalizedFamily.includes("mono")
        ? 0.58
        : normalizedFamily.includes("georgia") ||
            normalizedFamily.includes("times") ||
            normalizedFamily.includes("serif")
          ? 0.5
          : 0.46;
      const heuristicWidth = fontSizePx * heuristicRatio;

      const normalizedText = text.replace(/\s+/g, " ").trim();
      const elementRect = element.getBoundingClientRect();
      const appearsSingleLine = elementRect.height <= lineHeightPx * 1.35;
      const observedWidth =
        appearsSingleLine && normalizedText.length >= 12
          ? (elementRect.width / normalizedText.length) * 1.1
          : Number.POSITIVE_INFINITY;

      const candidateWidths = [measuredSampleWidth, heuristicWidth, observedWidth]
        .filter((value) => Number.isFinite(value) && value > 0);
      const baseWidth =
        candidateWidths.length > 0
          ? Math.min(...candidateWidths)
          : measuredSampleWidth || heuristicWidth || 8;
      return Math.max(2, baseWidth + letterSpacingPx);
    },
    []
  );

  const resolveAvailableWidthPx = useCallback(
    (element: HTMLElement, fallbackWidthPx: number) => {
      const selfWidth = element.getBoundingClientRect().width;
      const parentWidth = element.parentElement?.getBoundingClientRect().width ?? 0;
      const grandParentWidth =
        element.parentElement?.parentElement?.getBoundingClientRect().width ?? 0;
      const candidate = Math.max(selfWidth, parentWidth, grandParentWidth);
      const width = candidate > 0 ? candidate : fallbackWidthPx;
      return Math.max(80, Math.min(width, fallbackWidthPx));
    },
    []
  );

  const findFieldElement = useCallback((node: Node | null): HTMLElement | null => {
    if (!node) return null;
    const element =
      node.nodeType === Node.ELEMENT_NODE
        ? (node as Element)
        : node.parentElement;
    return element?.closest<HTMLElement>("[data-field-path]") ?? null;
  }, []);

  const getSelectionRangeInField = useCallback((
    range: Range,
    fieldElement: HTMLElement
  ): { start: number; end: number; text: string } | null => {
    const fieldText = normalizeText(fieldElement.textContent ?? "", true);
    if (!fieldText) return null;

    const preRange = range.cloneRange();
    preRange.selectNodeContents(fieldElement);
    preRange.setEnd(range.startContainer, range.startOffset);
    const start = normalizeText(preRange.toString(), true).length;
    const selectedText = normalizeText(range.toString(), true);
    const end = start + selectedText.length;

    if (selectedText.trim().length === 0) return null;
    if (start < 0 || end <= start) return null;
    if (end > fieldText.length) return null;

    return {
      start,
      end,
      text: fieldText.slice(start, end),
    };
  }, []);

  const collectSelectedFields = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      if (!isBulkOpen) {
        clearSelectionState();
      }
      return;
    }

    const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    if (!range) return;
    const container = resumeContentRef.current;
    if (!container) return;
    const ancestor = range.commonAncestorContainer;
    if (!container.contains(ancestor)) {
      if (!isBulkOpen) {
        clearSelectionState();
      }
      return;
    }

    const elements = Array.from(
      container.querySelectorAll<HTMLElement>("[data-field-path]")
    );
    const fields: SelectedField[] = [];
    const seen = new Set<string>();
    const fallbackWidthPx = getFallbackContentWidthPx();

    for (const element of elements) {
      if (!range.intersectsNode(element)) continue;
      const path = element.dataset.fieldPath;
      if (!path || seen.has(path)) continue;
      const text = (element.textContent ?? "").trim();
      const computed = window.getComputedStyle(element);
      const fontSizePx = parsePxValue(computed.fontSize);
      const fontFamily =
        computed.fontFamily ||
        getFontStack(DEFAULT_LAYOUT_PREFERENCES.fontPreferences.family);
      const fontShorthand =
        computed.font && computed.font !== ""
          ? computed.font
          : `${computed.fontWeight} ${computed.fontSize} ${fontFamily}`;
      const lineHeightPx = parsePxValue(computed.lineHeight) || Math.max(8, fontSizePx) * 1.25;
      const letterSpacingPx = parsePxValue(computed.letterSpacing);
      const availableWidthPx = resolveAvailableWidthPx(element, fallbackWidthPx);
      const safetyBuffer = getFontSafetyBuffer(fontFamily);
      const charWidthPx = measureCharWidth({
        element,
        text,
        fontShorthand,
        fontFamily,
        fontSizePx: Math.max(8, fontSizePx),
        lineHeightPx,
        letterSpacingPx,
      });
      fields.push({
        path,
        text,
        metrics: {
          availableWidthPx,
          fontSizePx: Math.max(8, fontSizePx),
          fontFamily,
          charWidthPx,
          safetyBuffer,
        },
      });
      seen.add(path);
    }

    if (fields.length === 0) {
      if (!isBulkOpen) {
        clearSelectionState();
      }
      return;
    }

    const rect = range.getBoundingClientRect();
    setSelectionState({ fields, rect });

    const startFieldElement = findFieldElement(range.startContainer);
    const endFieldElement = findFieldElement(range.endContainer);
    if (
      !startFieldElement ||
      !endFieldElement ||
      startFieldElement !== endFieldElement
    ) {
      setHyperlinkSelection(null);
      setIsHyperlinkPanelOpen(false);
      setHyperlinkDraft("");
      setHyperlinkError(null);
      return;
    }

    const path = startFieldElement.dataset.fieldPath;
    if (!path) {
      setHyperlinkSelection(null);
      setIsHyperlinkPanelOpen(false);
      setHyperlinkDraft("");
      setHyperlinkError(null);
      return;
    }

    const rangeInfo = getSelectionRangeInField(range, startFieldElement);
    if (!rangeInfo) {
      setHyperlinkSelection(null);
      setIsHyperlinkPanelOpen(false);
      setHyperlinkDraft("");
      setHyperlinkError(null);
      return;
    }

    setHyperlinkSelection({
      path,
      start: rangeInfo.start,
      end: rangeInfo.end,
      text: rangeInfo.text,
      rect,
    });
    setHyperlinkError(null);
  }, [
    findFieldElement,
    getFallbackContentWidthPx,
    getSelectionRangeInField,
    isBulkOpen,
    measureCharWidth,
    resolveAvailableWidthPx,
  ]);

  const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

  const selectionAnchor = useMemo(() => {
    if (!selectionState) return null;
    if (typeof window === "undefined") return null;
    const rect = selectionState.rect;
    const padding = 8;
    const width = hyperlinkSelection ? 72 : 32;
    const height = 32;
    const left = clamp(rect.right + padding, 8, window.innerWidth - width - 8);
    const top = clamp(rect.top - height - padding, 8, window.innerHeight - height - 8);
    return { left, top };
  }, [hyperlinkSelection, selectionState]);

  const selectedHyperlink = useMemo(() => {
    if (!hyperlinkSelection) return null;
    const pathLinks = hyperlinksByPath.get(hyperlinkSelection.path) ?? [];
    return (
      pathLinks.find(
        (link) =>
          link.start === hyperlinkSelection.start &&
          link.end === hyperlinkSelection.end
      ) ?? null
    );
  }, [hyperlinkSelection, hyperlinksByPath]);

  const openHyperlinkPanel = useCallback(() => {
    if (!hyperlinkSelection) return;
    setHyperlinkDraft(selectedHyperlink?.url ?? "");
    setHyperlinkError(null);
    setIsHyperlinkPanelOpen(true);
  }, [hyperlinkSelection, selectedHyperlink?.url]);

  useEffect(() => {
    if (!isHyperlinkPanelOpen || !hyperlinkSelection) return;
    setHyperlinkDraft(selectedHyperlink?.url ?? "");
    setHyperlinkError(null);
  }, [hyperlinkSelection, isHyperlinkPanelOpen, selectedHyperlink?.url]);

  const applyHyperlinkToSelection = useCallback(() => {
    if (!hyperlinkSelection) return;
    const normalizedUrl = normalizeHyperlinkUrl(hyperlinkDraft);
    if (!normalizedUrl) {
      setHyperlinkError(
        "Enter a valid URL (https://..., mailto:..., tel:..., or domain)."
      );
      return;
    }

    const value = getRenderedTextValueAtPath(resumeData, hyperlinkSelection.path);
    const selectedText = value.slice(
      hyperlinkSelection.start,
      hyperlinkSelection.end
    );
    if (!selectedText || selectedText !== hyperlinkSelection.text) {
      setHyperlinkError("Selection changed. Highlight the text again.");
      return;
    }

    const overlapsSelection = (link: TextHyperlink) =>
      link.path === hyperlinkSelection.path &&
      link.start < hyperlinkSelection.end &&
      link.end > hyperlinkSelection.start;

    const nextHyperlinks = (resumeData.hyperlinks ?? []).filter(
      (link) => !overlapsSelection(link)
    );
    nextHyperlinks.push({
      id: createId(),
      path: hyperlinkSelection.path,
      start: hyperlinkSelection.start,
      end: hyperlinkSelection.end,
      text: selectedText,
      url: normalizedUrl,
    });

    onResumeUpdate({
      ...resumeData,
      hyperlinks: nextHyperlinks,
    });
    setIsHyperlinkPanelOpen(false);
    setHyperlinkDraft("");
    setHyperlinkError(null);
  }, [hyperlinkDraft, hyperlinkSelection, onResumeUpdate, resumeData]);

  const removeHyperlinkFromSelection = useCallback(() => {
    if (!hyperlinkSelection) return;
    const nextHyperlinks = (resumeData.hyperlinks ?? []).filter(
      (link) =>
        !(
          link.path === hyperlinkSelection.path &&
          link.start === hyperlinkSelection.start &&
          link.end === hyperlinkSelection.end
        )
    );
    onResumeUpdate({
      ...resumeData,
      hyperlinks: nextHyperlinks,
    });
    setIsHyperlinkPanelOpen(false);
    setHyperlinkDraft("");
    setHyperlinkError(null);
  }, [hyperlinkSelection, onResumeUpdate, resumeData]);

  const buildSectionFields = useCallback((section: SectionKey): SelectedField[] => {
    if (section === "summary") {
      return [
        {
          path: "metadata.summary",
          text: metadata.summary ?? "",
        },
      ];
    }
    if (section === "experience") {
      return experience.flatMap((entry, index) => [
        { path: `experience[${index}].company`, text: entry.company },
        { path: `experience[${index}].jobTitle`, text: entry.jobTitle },
        { path: `experience[${index}].location`, text: entry.location },
        { path: `experience[${index}].startDate`, text: entry.startDate },
        { path: `experience[${index}].endDate`, text: entry.endDate },
        ...entry.bullets.map((bullet, bulletIndex) => ({
          path: `experience[${index}].bullets[${bulletIndex}]`,
          text: bullet,
        })),
      ]);
    }
    if (section === "projects") {
      return projects.flatMap((project, index) => [
        { path: `projects[${index}].name`, text: project.name },
        {
          path: `projects[${index}].technologies`,
          text: project.technologies.join(", "),
        },
        ...project.bullets.map((bullet, bulletIndex) => ({
          path: `projects[${index}].bullets[${bulletIndex}]`,
          text: bullet,
        })),
      ]);
    }
    if (section === "education") {
      return education.flatMap((entry, index) => [
        { path: `education[${index}].degree`, text: entry.degree ?? "" },
        { path: `education[${index}].institution`, text: entry.institution ?? "" },
        { path: `education[${index}].location`, text: entry.location ?? "" },
        { path: `education[${index}].field`, text: entry.field ?? "" },
        { path: `education[${index}].graduationDate`, text: entry.graduationDate ?? "" },
        { path: `education[${index}].gpa`, text: entry.gpa ?? "" },
        { path: `education[${index}].other`, text: entry.other ?? "" },
      ]);
    }
    if (section === "skills") {
      return skills.flatMap((skill, index) => [
        { path: `skills[${index}].name`, text: skill.name },
        { path: `skills[${index}].category`, text: skill.category },
      ]);
    }
    return [];
  }, [metadata.summary, experience, projects, education, skills]);

  const buildAllowedTargets = useCallback((
    fields: SelectedField[],
    scope: { type: "selection" | "section"; section?: string }
  ) => {
    const allowedPaths = new Set<string>();
    const allowedDeletes = new Set<string>();
    const allowedInserts = new Set<string>();

    fields.forEach((field) => {
      allowedPaths.add(field.path);
      const experienceMatch = field.path.match(/^experience\[(\d+)\]/);
      if (experienceMatch) {
        const idx = experienceMatch[1];
        allowedDeletes.add(`experience[${idx}]`);
        allowedInserts.add(`experience[${idx}].bullets`);
      }
      const projectMatch = field.path.match(/^projects\[(\d+)\]/);
      if (projectMatch) {
        const idx = projectMatch[1];
        allowedDeletes.add(`projects[${idx}]`);
        allowedInserts.add(`projects[${idx}].bullets`);
        allowedInserts.add(`projects[${idx}].technologies`);
      }
      const educationMatch = field.path.match(/^education\[(\d+)\]/);
      if (educationMatch) {
        const idx = educationMatch[1];
        allowedDeletes.add(`education[${idx}]`);
      }
      const skillMatch = field.path.match(/^skills\[(\d+)\]/);
      if (skillMatch) {
        const idx = skillMatch[1];
        allowedDeletes.add(`skills[${idx}]`);
        allowedInserts.add("skills");
      }
      const bulletMatch = field.path.match(/^(experience|projects)\[(\d+)\]\.bullets\[(\d+)\]/);
      if (bulletMatch) {
        const sectionName = bulletMatch[1];
        const idx = bulletMatch[2];
        allowedDeletes.add(field.path);
        allowedInserts.add(`${sectionName}[${idx}].bullets`);
      }
    });

    if (scope.type === "section") {
      const section = scope.section as SectionKey | undefined;
      if (section === "experience") {
        allowedInserts.add("experience");
      }
      if (section === "projects") {
        allowedInserts.add("projects");
      }
      if (section === "education") {
        allowedInserts.add("education");
      }
      if (section === "skills") {
        allowedInserts.add("skills");
      }
    }

    return { allowedPaths, allowedDeletes, allowedInserts };
  }, []);

  const normalizeBulkOps = useCallback((
    operations: Array<Omit<BulkOperation, "id">>,
    scope: { type: "selection" | "section"; section?: string },
    fields: SelectedField[]
  ) => {
    const { allowedPaths, allowedDeletes, allowedInserts } = buildAllowedTargets(
      fields,
      scope
    );

    return operations.flatMap((operation) => {
      if (operation.op === "replace") {
        if (!allowedPaths.has(operation.path)) return [];
        const replaceTypes: BulkOperation["itemType"][] = [
          "text",
          "bullet",
          "technology",
          "none",
        ];
        if (!replaceTypes.includes(operation.itemType)) return [];
        if (!operation.value?.trim()) return [];
        return [{ ...operation, id: createId() }];
      }
      if (operation.op === "delete") {
        if (!allowedDeletes.has(operation.path)) return [];
        return [{ ...operation, id: createId() }];
      }
      if (operation.op === "insert") {
        if (!allowedInserts.has(operation.path)) return [];
        if (!operation.value) return [];
        return [{ ...operation, id: createId() }];
      }
      return [];
    });
  }, [buildAllowedTargets]);

  const buildFieldLengthConstraints = useCallback(
    (fields: SelectedField[], maxLines: number) => {
      if (maxLines < 1) {
        return new Map<string, FieldLengthConstraint>();
      }
      const constraints = new Map<string, FieldLengthConstraint>();
      for (const field of fields) {
        if (!field.metrics) continue;
        const constraint = buildFieldLengthConstraint(field.metrics, maxLines);
        if (!constraint) continue;
        constraints.set(field.path, constraint);
      }
      return constraints;
    },
    []
  );

  const buildConstraintInstruction = (
    instruction: string,
    constraint?: FieldLengthConstraint
  ) => {
    if (!constraint) return instruction;
    return `${instruction}\n\nLength limit: max ${constraint.maxLines} lines, max ${constraint.maxCharsPerLine} chars per line, and max ${constraint.maxCharsTotal} chars total.`;
  };

  const requestBulkRewrite = useCallback(async (
    instruction: string,
    fields: SelectedField[],
    scope: { type: "selection" | "section"; section?: string },
    maxLines: number
  ) => {
    const trimmedInstruction = instruction.trim();
    if (!trimmedInstruction) return;
    if (scope.type === "selection" && fields.length === 0) {
      setBulkError("Select some resume text first.");
      return;
    }
    setBulkLoading(true);
    setBulkError(null);
    setBulkOps([]);

    try {
      const lineConstraintMap =
        scope.type === "selection"
          ? buildFieldLengthConstraints(fields, maxLines)
          : new Map<string, FieldLengthConstraint>();
      const fieldsPayload = fields.map((field) => ({
        path: field.path,
        text: field.text,
        lengthConstraint: lineConstraintMap.get(field.path),
      }));
      const lengthInstruction =
        lineConstraintMap.size > 0
          ? `Shorten each constrained replacement to fit the provided max line/character limits exactly.`
          : "";

      const response = await fetch("/api/selection-rewrite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          instruction: [trimmedInstruction, lengthInstruction]
            .filter(Boolean)
            .join("\n\n"),
          fields: fieldsPayload,
          scope,
        }),
      });

      const rawText = await response.text();
      let payload: SelectionRewriteResponse | null = null;
      try {
        payload =
          rawText ? (JSON.parse(rawText) as SelectionRewriteResponse) : null;
      } catch {
        payload = null;
      }

      if (!response.ok) {
        throw new Error(payload?.error || "Failed to rewrite selection.");
      }

      const operations = payload?.operations ?? [];
      const normalized = normalizeBulkOps(operations, scope, fields);
      if (normalized.length === 0) {
        if (scope.type === "selection" && fields.length === 1) {
          const selectedField = fields[0];
          const selectedConstraint = lineConstraintMap.get(selectedField.path);
          const inlineResponse = await fetch("/api/inline-rewrite", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              text: selectedField.text,
              instruction: buildConstraintInstruction(
                trimmedInstruction,
                selectedConstraint
              ),
              lengthConstraint: selectedConstraint,
              context: {
                source: "selection-fallback",
                path: selectedField.path,
                lengthConstraint: selectedConstraint,
              },
            }),
          });

          const inlineRawText = await inlineResponse.text();
          let inlinePayload: InlineRewriteResponse | null = null;
          try {
            inlinePayload = inlineRawText
              ? (JSON.parse(inlineRawText) as InlineRewriteResponse)
              : null;
          } catch {
            inlinePayload = null;
          }

          if (!inlineResponse.ok) {
            throw new Error(
              inlinePayload?.error || "Failed to rewrite selection."
            );
          }

          const replacement = inlinePayload?.replacement?.trim();
          if (!replacement) {
            throw new Error("AI returned an empty replacement.");
          }

          if (selectedConstraint) {
            const wrappedLineCount = estimateWrappedLineCount(
              replacement,
              selectedConstraint.maxCharsPerLine
            );
            if (
              replacement.length > selectedConstraint.maxCharsTotal ||
              wrappedLineCount > selectedConstraint.maxLines
            ) {
              throw new Error(
                "AI exceeded the selected max-lines limit. Try regenerating or increase the line limit."
              );
            }
          }

          setBulkOps([
            {
              id: createId(),
              op: "replace",
              path: selectedField.path,
              value: replacement,
              index: -1,
              itemType: "text",
            },
          ]);
          setIsBulkOpen(true);
          return;
        }
        throw new Error("No valid edits were returned for this selection.");
      }
      setBulkOps(normalized);
      setIsBulkOpen(true);
    } catch (error) {
      setBulkError(
        error instanceof Error ? error.message : "Failed to rewrite selection."
      );
    } finally {
      setBulkLoading(false);
    }
  }, [buildFieldLengthConstraints, normalizeBulkOps]);

  const openSingleFieldAiPanel = useCallback((options: {
    targetKey: string;
    targetLabel: string;
    path: string;
    text: string;
  }) => {
    openBulkPanel({
      fields: [{ path: options.path, text: options.text }],
      targetLabel: options.targetLabel,
      scope: { type: "selection" },
      activeTargetKey: options.targetKey,
    });
  }, [openBulkPanel]);

  const openSectionAiPanel = useCallback((section: SectionKey, targetKey: string) => {
    const fields = buildSectionFields(section);
    openBulkPanel({
      fields,
      targetLabel: `Section: ${SECTION_LABELS[section]}`,
      scope: { type: "section", section },
      activeTargetKey: targetKey,
    });
  }, [buildSectionFields, openBulkPanel]);

  const getValueAtPath = (data: ResumeData, path: string) => {
    const segments = parseFieldPath(path);
    let cursor: any = data;
    for (const segment of segments) {
      if (cursor == null) return "";
      cursor = cursor[segment as keyof typeof cursor];
    }
    return cursor;
  };

  const buildResumeDataWithRemappedHyperlinks = useCallback((
    path: string,
    buildNextData: (current: ResumeData) => ResumeData
  ) => {
    const nextData = buildNextData(resumeData);
    const previousText = getRenderedTextValueAtPath(resumeData, path);
    const nextText = getRenderedTextValueAtPath(nextData, path);
    const activeWholeFieldHyperlink =
      editingWholeFieldHyperlinksRef.current.get(path) ?? null;

    if (activeWholeFieldHyperlink) {
      const unaffectedHyperlinks = (resumeData.hyperlinks ?? []).filter(
        (hyperlink) => hyperlink.path !== path
      );

      return {
        ...nextData,
        hyperlinks: nextText
          ? [
              ...unaffectedHyperlinks,
              {
                ...activeWholeFieldHyperlink,
                start: 0,
                end: nextText.length,
                text: nextText,
              },
            ]
          : unaffectedHyperlinks,
      };
    }

    return {
      ...nextData,
      hyperlinks: remapHyperlinksForFieldChange(
        resumeData.hyperlinks,
        path,
        previousText,
        nextText
      ),
    };
  }, [resumeData]);

  const handleWholeFieldHyperlinkEditStart = useCallback((
    path: string,
    hyperlink: TextHyperlink
  ) => {
    editingWholeFieldHyperlinksRef.current.set(path, hyperlink);
  }, []);

  const handleWholeFieldHyperlinkEditEnd = useCallback((path: string) => {
    editingWholeFieldHyperlinksRef.current.delete(path);
  }, []);

  const updateTextField = useCallback((
    path: string,
    buildNextData: (current: ResumeData) => ResumeData
  ) => {
    onResumeUpdate(buildResumeDataWithRemappedHyperlinks(path, buildNextData));
  }, [buildResumeDataWithRemappedHyperlinks, onResumeUpdate]);

  const parseJsonValue = <T,>(value: string): T | null => {
    try {
      const parsed = JSON.parse(value) as T;
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  };

  const normalizeInsertValue = (
    path: string,
    itemType: BulkOperation["itemType"],
    value: string
  ) => {
    if (itemType === "bullet" || itemType === "technology") {
      return value;
    }

    if (itemType === "experience" && path === "experience") {
      const entry = parseJsonValue<{
        company?: string;
        jobTitle?: string;
        location?: string;
        startDate?: string;
        endDate?: string;
        bullets?: string[];
      }>(value);
      if (!entry) return null;
      return {
        id: createId(),
        company: entry.company ?? "",
        jobTitle: entry.jobTitle ?? "",
        location: entry.location ?? "",
        startDate: entry.startDate ?? "",
        endDate: entry.endDate ?? "",
        bullets: Array.isArray(entry.bullets) ? entry.bullets : [],
      };
    }

    if (itemType === "project" && path === "projects") {
      const entry = parseJsonValue<{
        name?: string;
        technologies?: string[];
        bullets?: string[];
      }>(value);
      if (!entry) return null;
      return {
        id: createId(),
        name: entry.name ?? "",
        technologies: Array.isArray(entry.technologies)
          ? entry.technologies
          : [],
        bullets: Array.isArray(entry.bullets) ? entry.bullets : [],
      };
    }

    if (itemType === "education" && path === "education") {
      const entry = parseJsonValue<{
        degree?: string;
        institution?: string;
        location?: string;
        field?: string;
        graduationDate?: string;
        gpa?: string;
        other?: string;
      }>(value);
      if (!entry) return null;
      return {
        id: createId(),
        degree: entry.degree ?? "",
        institution: entry.institution ?? "",
        location: entry.location ?? "",
        field: entry.field ?? "",
        graduationDate: entry.graduationDate ?? "",
        gpa: entry.gpa ?? "",
        other: entry.other ?? "",
      };
    }

    if (itemType === "skill" && path === "skills") {
      const entry = parseJsonValue<{ name?: string; category?: string }>(value);
      if (!entry) return null;
      return {
        id: createId(),
        name: entry.name ?? "",
        category: entry.category ?? "",
      };
    }

    return null;
  };

  const removeAtPath = (data: ResumeData, path: string) => {
    const segments = parseFieldPath(path);
    const index = segments[segments.length - 1];
    if (typeof index !== "number") return data;
    const parentSegments = segments.slice(0, -1);
    const next = structuredClone(data);
    let cursor: any = next;
    for (const segment of parentSegments) {
      if (cursor == null) return data;
      cursor = cursor[segment as keyof typeof cursor];
    }
    if (!Array.isArray(cursor)) return data;
    if (index < 0 || index >= cursor.length) return data;
    cursor.splice(index, 1);
    return next;
  };

  const insertAtPath = (
    data: ResumeData,
    path: string,
    itemType: BulkOperation["itemType"],
    value: BulkOperation["value"],
    index?: number
  ) => {
    const segments = parseFieldPath(path);
    const last = segments[segments.length - 1];
    if (typeof last !== "string") return data;
    const next = structuredClone(data);
    let cursor: any = next;
    for (const segment of segments) {
      if (segment === last) break;
      if (cursor == null) return data;
      cursor = cursor[segment as keyof typeof cursor];
    }
    if (!cursor || typeof cursor !== "object") return data;
    const array = cursor[last as keyof typeof cursor];
    if (!Array.isArray(array)) return data;

    const normalizedValue = normalizeInsertValue(last, itemType, value);
    if (!normalizedValue) return data;

    const insertIndex =
      typeof index === "number" && index >= 0 && index <= array.length
        ? index
        : array.length;

    array.splice(insertIndex, 0, normalizedValue);
    return next;
  };

  const applyBulkOperation = (op: BulkOperation) => {
    if (op.op === "replace") {
      if (op.path.endsWith(".technologies")) {
        const next = structuredClone(resumeData);
        const current = getValueAtPath(next, op.path);
        if (Array.isArray(current)) {
          const segments = parseFieldPath(op.path);
          let cursor: any = next;
          for (let i = 0; i < segments.length - 1; i += 1) {
            cursor = cursor[segments[i] as keyof typeof cursor];
          }
          cursor[segments[segments.length - 1] as keyof typeof cursor] =
            parseCommaList(op.value);
          return buildResumeDataWithRemappedHyperlinks(op.path, () => next);
        }
      }
      return buildResumeDataWithRemappedHyperlinks(op.path, (current) =>
        setResumeValueAtPath(current, op.path, op.value)
      );
    }
    if (op.op === "delete") {
      return removeAtPath(resumeData, op.path);
    }
    if (op.op === "insert") {
      return insertAtPath(resumeData, op.path, op.itemType, op.value, op.index);
    }
    return resumeData;
  };

  const acceptBulkOperation = (opId: string) => {
    const op = bulkOps.find((entry) => entry.id === opId);
    if (!op) return;
    const next = applyBulkOperation(op);
    onResumeUpdate(next);
    setBulkOps((current) => current.filter((entry) => entry.id !== opId));
  };

  const rejectBulkOperation = (opId: string) => {
    setBulkOps((current) => current.filter((entry) => entry.id !== opId));
  };


  const aiTriggerClasses = (isOpen: boolean, hoverClasses: string) =>
    cn(
      "h-5 w-5 transition",
      isOpen
        ? "opacity-100 pointer-events-auto text-amber-600"
        : cn("opacity-0 pointer-events-none text-muted-foreground", hoverClasses)
    );

  const hasExperience = experience.length > 0;
  const hasProjects = projects.length > 0;
  const hasEducation = education.length > 0;
  const hasSkills = skills.length > 0;
  const experienceOrder = resolvedLayoutPreferences.experienceOrder;
  const educationOrder = resolvedLayoutPreferences.educationOrder;
  const educationMetadataPlacement =
    resolvedLayoutPreferences.educationMetadataPlacement;
  const resumeSpacing = resolvedLayoutPreferences.spacing;
  const resumeHeaderContentGap = resumeSpacing.sectionContentGap;
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

  const updateMetadata = useCallback((updates: Partial<ResumeData["metadata"]>) => {
    onResumeUpdate({
      ...resumeData,
      metadata: {
        ...metadata,
        ...updates,
      },
    });
  }, [onResumeUpdate, resumeData, metadata]);

  const updateContactInfo = useCallback((
    updates: Partial<ResumeData["metadata"]["contactInfo"]>
  ) => {
    updateMetadata({
      contactInfo: {
        ...metadata.contactInfo,
        ...updates,
      },
    });
  }, [updateMetadata, metadata.contactInfo]);

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
        coverLetterFontPreferences: {
          ...resolvedLayoutPreferences.coverLetterFontPreferences,
          ...updates.coverLetterFontPreferences,
          sizes: {
            ...resolvedLayoutPreferences.coverLetterFontPreferences.sizes,
            ...updates.coverLetterFontPreferences?.sizes,
          },
        },
        spacing: {
          ...resolvedLayoutPreferences.spacing,
          ...updates.spacing,
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

  const updateCoverLetter = useCallback((updates: Partial<ResumeData["coverLetter"]>) => {
    onResumeUpdate({
      ...resumeData,
      coverLetter: {
        ...coverLetter,
        ...updates,
      },
    });
  }, [onResumeUpdate, resumeData, coverLetter]);

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
  const resumeFontPreferences = resolvedLayoutPreferences.fontPreferences;
  const coverLetterFontPreferences =
    resolvedLayoutPreferences.coverLetterFontPreferences ??
    resolvedLayoutPreferences.fontPreferences;

  const alignmentClassMap: Record<TextAlignment, string> = {
    left: "text-left",
    center: "text-center",
    right: "text-right",
  };

  const getAlignmentClass = (value: TextAlignment) =>
    alignmentClassMap[value] ?? "text-left";

  const resumeTypographyStyle = useMemo<CSSProperties>(
    () => ({
      fontFamily: getFontStack(resumeFontPreferences.family),
    }),
    [resumeFontPreferences.family]
  );

  const coverLetterTypographyStyle = useMemo<CSSProperties>(
    () => ({
      fontFamily: getFontStack(coverLetterFontPreferences.family),
    }),
    [coverLetterFontPreferences.family]
  );

  const resumeFontSizeStyles = useMemo(() => {
    const toStyle = (size: number): CSSProperties => ({ fontSize: `${size}px` });
    return {
      name: toStyle(resumeFontPreferences.sizes.name),
      subtitle: toStyle(resumeFontPreferences.sizes.subtitle),
      contact: toStyle(resumeFontPreferences.sizes.contact),
      sectionTitle: toStyle(resumeFontPreferences.sizes.sectionTitle),
      itemTitle: toStyle(resumeFontPreferences.sizes.itemTitle),
      itemDetail: toStyle(resumeFontPreferences.sizes.itemDetail),
      itemMeta: toStyle(resumeFontPreferences.sizes.itemMeta),
      body: toStyle(resumeFontPreferences.sizes.body),
    };
  }, [resumeFontPreferences.sizes]);

  const coverLetterFontSizeStyles = useMemo(() => {
    const toStyle = (size: number): CSSProperties => ({ fontSize: `${size}px` });
    return {
      name: toStyle(coverLetterFontPreferences.sizes.name),
      subtitle: toStyle(coverLetterFontPreferences.sizes.subtitle),
      contact: toStyle(coverLetterFontPreferences.sizes.contact),
      sectionTitle: toStyle(coverLetterFontPreferences.sizes.sectionTitle),
      itemTitle: toStyle(coverLetterFontPreferences.sizes.itemTitle),
      itemDetail: toStyle(coverLetterFontPreferences.sizes.itemDetail),
      itemMeta: toStyle(coverLetterFontPreferences.sizes.itemMeta),
      body: toStyle(coverLetterFontPreferences.sizes.body),
    };
  }, [coverLetterFontPreferences.sizes]);

  const renderInlineAlignment = (
    label: string,
    value: TextAlignment,
    onChange: (nextValue: TextAlignment) => void
  ) => {
    if (isPrintPreviewMode) return null;
    return (
      <div className="relative z-10 ml-auto mt-1 flex items-center gap-1 rounded-md border border-border bg-background/90 px-1 py-0.5 text-[10px] text-muted-foreground shadow-sm backdrop-blur-sm transition print:hidden md:pointer-events-none md:absolute md:left-full md:top-0 md:ml-1.5 md:mt-0 md:opacity-0 md:group-hover:pointer-events-auto md:group-hover:opacity-100 md:group-focus-within:pointer-events-auto md:group-focus-within:opacity-100">
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
  };

  const addExperienceEntry = () => {
    const newEntry: ResumeData["experience"][number] = {
      id: createId(),
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
      id: createId(),
      name: "",
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
      id: createId(),
      degree: "",
      institution: "",
      location: "",
      field: "",
      graduationDate: "",
      gpa: "",
      other: "",
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
      id: createId(),
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
  const renderSectionHeader = (
    title: string,
    section: SectionKey,
    addButton?: ReactNode
  ) => {
    const sectionAiKey = `section-ai-${section}`;
    const isSectionAiOpen = isBulkOpen && activeAiTarget === sectionAiKey;

    return (
      <div className="flex items-center justify-between border-b border-gray-300 pb-0.5 text-gray-900 dark:text-gray-100 dark:border-gray-700">
        <div className="flex min-w-0 items-center gap-1">
          <h2
            className="font-bold uppercase leading-none tracking-wide"
            style={resumeFontSizeStyles.sectionTitle}
          >
            {title}
          </h2>
          {!isPrintPreviewMode && (
            <InlineAiAssist
              isOpen={isSectionAiOpen}
              onToggle={() => openSectionAiPanel(section, sectionAiKey)}
              triggerClassName="h-5 w-5 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
              ariaLabel={`Rewrite ${title} section with AI`}
            />
          )}
        </div>
        {!isPrintPreviewMode ? addButton : null}
      </div>
    );
  };

  const renderSummaryHeader = () => renderSectionHeader("Summary", "summary");

  const renderSummaryContent = () => (
    renderWithFeedback(
      "metadata.summary",
      <EditableText
        value={metadata.summary}
        onChange={(summary) =>
          updateTextField("metadata.summary", (current) => ({
            ...current,
            metadata: {
              ...current.metadata,
              summary,
            },
          }))
        }
        placeholder="Your professional summary will appear here..."
        className="leading-relaxed text-gray-700 dark:text-gray-300"
        style={resumeFontSizeStyles.body}
        multiline
        fieldPath="metadata.summary"
      />,
      {
        wrapperElement: "div",
        wrapperClassName: "w-full pr-5",
        indicatorClassName: "absolute right-0 top-0",
      }
    )
  );

  const renderExperienceHeader = () =>
    renderSectionHeader(
      "Experience",
      "experience",
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

  const renderExperienceItem = (
    entry: ResumeData["experience"][number],
    entryIndex: number
  ) => {
    const primaryField =
      experienceOrder === "title-first" ? "jobTitle" : "company";
    const secondaryField =
      experienceOrder === "title-first" ? "company" : "jobTitle";
    const primaryFallback =
      experienceOrder === "title-first" ? "Job Title" : "Company Name";
    const secondaryFallback =
      experienceOrder === "title-first" ? "Company Name" : "Job Title";
    const primaryPath = `experience[${entryIndex}].${primaryField}`;
    const secondaryPath = `experience[${entryIndex}].${secondaryField}`;
    const startDatePath = `experience[${entryIndex}].startDate`;
    const endDatePath = `experience[${entryIndex}].endDate`;
    const locationPath = `experience[${entryIndex}].location`;
    return (
      <div className="group space-y-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className="min-w-0 flex-1 font-semibold leading-[1.1] text-gray-900 dark:text-gray-100"
            style={resumeFontSizeStyles.itemTitle}
          >
            {renderWithFeedback(
              primaryPath,
              <EditableText
                value={entry[primaryField]}
                onChange={(value) =>
                  updateTextField(primaryPath, (current) => ({
                    ...current,
                    experience: current.experience.map((item) =>
                      item.id === entry.id
                        ? ({
                            ...item,
                            [primaryField]: value,
                          } as ResumeData["experience"][number])
                        : item
                    ),
                  }))
                }
                placeholder={primaryFallback}
                fieldPath={primaryPath}
              />
            )}
          </span>
          <div className="flex shrink-0 items-baseline gap-1">
            {!isPrintPreviewMode && (
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-foreground"
                onClick={() => addExperienceBullet(entry.id)}
                aria-label="Add experience bullet"
              >
                <Plus className="h-3 w-3" />
              </Button>
            )}
            {!isPrintPreviewMode && (
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-destructive"
                onClick={() => removeExperienceEntry(entry.id)}
                aria-label="Remove experience"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
            <span
              className="leading-[1.1] text-gray-600 dark:text-gray-400"
              style={resumeFontSizeStyles.itemMeta}
            >
              {renderWithFeedback(
                startDatePath,
                <EditableText
                  value={entry.startDate}
                  onChange={(value) =>
                    updateTextField(startDatePath, (current) => ({
                      ...current,
                      experience: current.experience.map((item) =>
                        item.id === entry.id
                          ? { ...item, startDate: value }
                          : item
                      ),
                    }))
                  }
                  placeholder="Start"
                  fieldPath={startDatePath}
                />
              )}
              <span className="mx-1">-</span>
              {renderWithFeedback(
                endDatePath,
                <EditableText
                  value={entry.endDate}
                  onChange={(value) =>
                    updateTextField(endDatePath, (current) => ({
                      ...current,
                      experience: current.experience.map((item) =>
                        item.id === entry.id
                          ? { ...item, endDate: value }
                          : item
                      ),
                    }))
                  }
                  placeholder="Present"
                  fieldPath={endDatePath}
                />
              )}
            </span>
          </div>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <p
            className="min-w-0 flex-1 leading-[1.1] text-gray-700 dark:text-gray-300"
            style={resumeFontSizeStyles.itemDetail}
          >
            {renderWithFeedback(
              secondaryPath,
              <EditableText
                value={entry[secondaryField]}
                onChange={(value) =>
                  updateTextField(secondaryPath, (current) => ({
                    ...current,
                    experience: current.experience.map((item) =>
                      item.id === entry.id
                        ? ({
                            ...item,
                            [secondaryField]: value,
                          } as ResumeData["experience"][number])
                        : item
                    ),
                  }))
                }
                placeholder={secondaryFallback}
                fieldPath={secondaryPath}
              />
            )}
          </p>
          <p
            className="shrink-0 text-right leading-[1.1] text-gray-600 dark:text-gray-400"
            style={resumeFontSizeStyles.itemDetail}
          >
            {renderWithFeedback(
              locationPath,
              <EditableText
                value={entry.location}
                onChange={(value) =>
                  updateTextField(locationPath, (current) => ({
                    ...current,
                    experience: current.experience.map((item) =>
                      item.id === entry.id
                        ? { ...item, location: value }
                        : item
                    ),
                  }))
                }
                placeholder="Location"
                fieldPath={locationPath}
              />
            )}
          </p>
        </div>
        {entry.bullets.length > 0 && (
          <ul
            className="m-0 mt-0 grid list-none p-0 leading-[1.15] text-gray-600 dark:text-gray-400"
            style={{
              ...resumeFontSizeStyles.body,
              rowGap: `${resumeSpacing.bulletGap}px`,
            }}
            role="list"
          >
            {entry.bullets.map((bullet, idx) => {
              const aiKey = `experience-${entry.id}-bullet-${idx}`;
              const isAiOpen = isBulkOpen && activeAiTarget === aiKey;
              const bulletPath = `experience[${entryIndex}].bullets[${idx}]`;
              const bulletFeedback = pickFeedback(bulletPath);
              return (
                <li
                  key={idx}
                  className="group/bullet relative flex items-start gap-1.5 leading-[1.15]"
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
                      updateTextField(bulletPath, (current) => ({
                        ...current,
                        experience: current.experience.map((item) => {
                          if (item.id !== entry.id) {
                            return item;
                          }
                          const nextBullets = [...item.bullets];
                          nextBullets[idx] = value;
                          return { ...item, bullets: nextBullets };
                        }),
                      }))
                    }
                    placeholder="Describe your accomplishment..."
                    className="min-w-0 flex-1 break-words self-start leading-[1.15] block"
                    fieldPath={bulletPath}
                  />
                  {!isPrintPreviewMode && (
                    <div className="absolute right-0 top-[0.1em] z-10 flex items-center gap-1 translate-x-full">
                      {bulletFeedback ? (
                        <QualityIndicator
                          feedback={bulletFeedback.feedback}
                          path={bulletFeedback.path}
                          onApplySuggestion={onApplySuggestion}
                        />
                      ) : null}
                      <InlineAiAssist
                        isOpen={isAiOpen}
                        onToggle={() =>
                          openSingleFieldAiPanel({
                            targetKey: aiKey,
                            targetLabel: "Experience Bullet",
                            path: bulletPath,
                            text: bullet,
                          })
                        }
                        triggerClassName={aiTriggerClasses(
                          isAiOpen,
                          "group-hover/bullet:opacity-100 group-hover/bullet:pointer-events-auto"
                        )}
                        ariaLabel="Rewrite bullet with AI"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          "h-4 w-4 text-muted-foreground transition hover:text-destructive",
                          isAiOpen
                            ? "opacity-100 pointer-events-auto"
                            : "opacity-0 pointer-events-none group-hover/bullet:opacity-100 group-hover/bullet:pointer-events-auto"
                        )}
                        onClick={() => removeExperienceBullet(entry.id, idx)}
                        aria-label="Remove bullet"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  };

  const renderExperienceEmpty = () => (
    <p
      className="text-gray-500 dark:text-gray-400 italic"
      style={resumeFontSizeStyles.body}
    >
      Add experience entries using the button above.
    </p>
  );

  const renderProjectsHeader = () =>
    renderSectionHeader(
      "Projects",
      "projects",
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

  const renderProjectItem = (
    project: ResumeData["projects"][number],
    projectIndex: number
  ) => {
    const namePath = `projects[${projectIndex}].name`;
    const technologyPaths = project.technologies.map(
      (_, index) => `projects[${projectIndex}].technologies[${index}]`
    );

    return (
      <div className="group space-y-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className="min-w-0 flex-1 font-semibold leading-[1.1] text-gray-900 dark:text-gray-100"
            style={resumeFontSizeStyles.itemTitle}
          >
            {renderWithFeedback(
              namePath,
              <EditableText
                value={project.name}
                onChange={(value) =>
                  updateTextField(namePath, (current) => ({
                    ...current,
                    projects: current.projects.map((item) =>
                      item.id === project.id
                        ? { ...item, name: value }
                        : item
                    ),
                  }))
                }
                placeholder="Project Name"
                fieldPath={namePath}
              />
            )}
          </span>
          <div className="flex shrink-0 items-baseline gap-1">
            {!isPrintPreviewMode && (
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-foreground"
                onClick={() => addProjectBullet(project.id)}
                aria-label="Add project bullet"
              >
                <Plus className="h-3 w-3" />
              </Button>
            )}
            {!isPrintPreviewMode && (
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-destructive"
                onClick={() => removeProjectEntry(project.id)}
                aria-label="Remove project"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
            <span
              className="text-right leading-[1.1] text-gray-500 dark:text-gray-400"
              style={resumeFontSizeStyles.itemMeta}
            >
              {renderWithFeedback(
                technologyPaths,
                <EditableText
                  value={project.technologies.join(", ")}
                  onChange={(value) =>
                    updateTextField(`projects[${projectIndex}].technologies`, (current) => ({
                      ...current,
                      projects: current.projects.map((item) =>
                        item.id === project.id
                          ? {
                              ...item,
                              technologies: parseCommaList(value),
                            }
                          : item
                      ),
                    }))
                  }
                  placeholder="Technologies"
                  fieldPath={`projects[${projectIndex}].technologies`}
                />
              )}
            </span>
          </div>
        </div>
        {project.bullets.length > 0 && (
          <ul
            className="m-0 mt-0 grid list-none p-0 leading-[1.15] text-gray-600 dark:text-gray-400"
            style={{
              ...resumeFontSizeStyles.body,
              rowGap: `${resumeSpacing.bulletGap}px`,
            }}
            role="list"
          >
            {project.bullets.map((bullet, idx) => {
              const aiKey = `project-${project.id}-bullet-${idx}`;
              const isAiOpen = isBulkOpen && activeAiTarget === aiKey;
              const bulletPath = `projects[${projectIndex}].bullets[${idx}]`;
              const bulletFeedback = pickFeedback(bulletPath);
              return (
                <li
                  key={idx}
                  className="group/bullet relative flex items-start gap-1.5 leading-[1.15]"
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
                      updateTextField(bulletPath, (current) => ({
                        ...current,
                        projects: current.projects.map((item) => {
                          if (item.id !== project.id) {
                            return item;
                          }
                          const nextBullets = [...item.bullets];
                          nextBullets[idx] = value;
                          return { ...item, bullets: nextBullets };
                        }),
                      }))
                    }
                    placeholder="Project impact..."
                    className="min-w-0 flex-1 break-words self-start leading-[1.15] block"
                    fieldPath={bulletPath}
                  />
                  {!isPrintPreviewMode && (
                    <div className="absolute right-0 top-[0.1em] z-10 flex items-center gap-1 translate-x-full">
                      {bulletFeedback ? (
                        <QualityIndicator
                          feedback={bulletFeedback.feedback}
                          path={bulletFeedback.path}
                          onApplySuggestion={onApplySuggestion}
                        />
                      ) : null}
                      <InlineAiAssist
                        isOpen={isAiOpen}
                        onToggle={() =>
                          openSingleFieldAiPanel({
                            targetKey: aiKey,
                            targetLabel: "Project Bullet",
                            path: bulletPath,
                            text: bullet,
                          })
                        }
                        triggerClassName={aiTriggerClasses(
                          isAiOpen,
                          "group-hover/bullet:opacity-100 group-hover/bullet:pointer-events-auto"
                        )}
                        ariaLabel="Rewrite project bullet with AI"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          "h-4 w-4 text-muted-foreground transition hover:text-destructive",
                          isAiOpen
                            ? "opacity-100 pointer-events-auto"
                            : "opacity-0 pointer-events-none group-hover/bullet:opacity-100 group-hover/bullet:pointer-events-auto"
                        )}
                        onClick={() => removeProjectBullet(project.id, idx)}
                        aria-label="Remove bullet"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  };

  const renderProjectsEmpty = () => (
    <p
      className="text-gray-500 dark:text-gray-400 italic"
      style={resumeFontSizeStyles.body}
    >
      Add project entries using the button above.
    </p>
  );

  const renderEducationHeader = () =>
    renderSectionHeader(
      "Education",
      "education",
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

  const renderEducationItem = (
    entry: ResumeData["education"][number],
    entryIndex: number
  ) => {
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
    const primaryPath = `education[${entryIndex}].${primaryField}`;
    const secondaryPath = `education[${entryIndex}].${secondaryField}`;
    const graduationPath = `education[${entryIndex}].graduationDate`;
    const gpaPath = `education[${entryIndex}].gpa`;
    const otherPath = `education[${entryIndex}].other`;
    const locationPath = `education[${entryIndex}].location`;
    const institutionOnPrimaryLine = primaryField === "institution";
    const renderEducationMetadata = (placement: "inline" | "stacked") => {
      if (!entry.gpa && !entry.other) {
        return null;
      }

      const gpaValue = entry.gpa ? (
        <span className="inline-flex items-baseline gap-1">
          <span
            className="text-gray-500 dark:text-gray-400"
            style={resumeFontSizeStyles.itemMeta}
          >
            GPA:
          </span>
          {renderWithFeedback(
            gpaPath,
            <EditableText
              value={entry.gpa}
              onChange={(value) =>
                updateTextField(gpaPath, (current) => ({
                  ...current,
                  education: current.education.map((item) =>
                    item.id === entry.id ? { ...item, gpa: value } : item
                  ),
                }))
              }
              placeholder="GPA"
              fieldPath={gpaPath}
            />
          )}
        </span>
      ) : null;

      const otherValue = entry.other
        ? renderWithFeedback(
            otherPath,
            <EditableText
              value={entry.other}
              onChange={(value) =>
                updateTextField(otherPath, (current) => ({
                  ...current,
                  education: current.education.map((item) =>
                    item.id === entry.id ? { ...item, other: value } : item
                  ),
                }))
              }
              placeholder="Honours"
              fieldPath={otherPath}
            />
          )
        : null;

      if (placement === "stacked") {
        return (
          <p
            className="leading-[1.1] text-gray-600 dark:text-gray-400"
            style={resumeFontSizeStyles.itemMeta}
          >
            {gpaValue}
            {gpaValue && otherValue ? (
              <span className="text-gray-400"> | </span>
            ) : null}
            {otherValue}
          </p>
        );
      }

      return (
        <>
          {gpaValue ? (
            <>
              <span className="text-gray-400"> | </span>
              {gpaValue}
            </>
          ) : null}
          {otherValue ? (
            <>
              <span className="text-gray-400"> | </span>
              {otherValue}
            </>
          ) : null}
        </>
      );
    };

    return (
      <div className="group space-y-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <p
            className="font-semibold leading-[1.1] text-gray-900 dark:text-gray-100"
            style={resumeFontSizeStyles.itemTitle}
          >
            {renderWithFeedback(
              primaryPath,
              <EditableText
                value={entry[primaryField] ?? ""}
                onChange={(value) =>
                  updateTextField(primaryPath, (current) => ({
                    ...current,
                    education: current.education.map((item) =>
                      item.id === entry.id
                        ? ({
                            ...item,
                            [primaryField]: value,
                          } as ResumeData["education"][number])
                        : item
                    ),
                  }))
                }
                placeholder={primaryFallback}
                fieldPath={primaryPath}
              />
            )}
            {institutionOnPrimaryLine && educationMetadataPlacement === "inline"
              ? renderEducationMetadata("inline")
              : null}
          </p>
          <div className="flex items-baseline gap-1">
            {!isPrintPreviewMode && (
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-destructive"
                onClick={() => removeEducationEntry(entry.id)}
                aria-label="Remove education"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
            <span
              className="leading-[1.1] text-gray-600 dark:text-gray-400"
              style={resumeFontSizeStyles.itemMeta}
            >
              {renderWithFeedback(
                graduationPath,
                <EditableText
                  value={entry.graduationDate ?? ""}
                  onChange={(value) =>
                    updateTextField(graduationPath, (current) => ({
                      ...current,
                      education: current.education.map((item) =>
                        item.id === entry.id
                          ? { ...item, graduationDate: value }
                          : item
                      ),
                    }))
                  }
                  placeholder="Graduation"
                  fieldPath={graduationPath}
                />
              )}
            </span>
          </div>
        </div>
        {institutionOnPrimaryLine && educationMetadataPlacement === "stacked"
          ? renderEducationMetadata("stacked")
          : null}
        <div className="flex items-baseline justify-between gap-2">
          <p
            className="leading-[1.1] text-gray-700 dark:text-gray-300"
            style={resumeFontSizeStyles.itemDetail}
          >
            {renderWithFeedback(
              secondaryPath,
              <EditableText
                value={entry[secondaryField] ?? ""}
                onChange={(value) =>
                  updateTextField(secondaryPath, (current) => ({
                    ...current,
                    education: current.education.map((item) =>
                      item.id === entry.id
                        ? ({
                            ...item,
                            [secondaryField]: value,
                          } as ResumeData["education"][number])
                        : item
                    ),
                  }))
                }
                placeholder={secondaryFallback}
                fieldPath={secondaryPath}
              />
            )}
            {!institutionOnPrimaryLine && educationMetadataPlacement === "inline"
              ? renderEducationMetadata("inline")
              : null}
          </p>
          <p
            className="text-right leading-[1.1] text-gray-600 dark:text-gray-400"
            style={resumeFontSizeStyles.itemDetail}
          >
            {renderWithFeedback(
              locationPath,
              <EditableText
                value={entry.location ?? ""}
                onChange={(value) =>
                  updateTextField(locationPath, (current) => ({
                    ...current,
                    education: current.education.map((item) =>
                      item.id === entry.id
                        ? { ...item, location: value }
                        : item
                    ),
                  }))
                }
                placeholder="Location"
                fieldPath={locationPath}
              />
            )}
          </p>
        </div>
        {!institutionOnPrimaryLine && educationMetadataPlacement === "stacked"
          ? renderEducationMetadata("stacked")
          : null}
      </div>
    );
  };

  const renderEducationEmpty = () => (
    <p
      className="text-gray-500 dark:text-gray-400 italic"
      style={resumeFontSizeStyles.body}
    >
      Add education entries using the button above.
    </p>
  );

  const renderSkillsHeader = () =>
    renderSectionHeader(
      "Skills",
      "skills",
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
    const getSkillIndex = (skillId: string) =>
      skills.findIndex((skill) => skill.id === skillId);

    const renderSkillItem = (skill: SkillEntry) => {
      const skillIndex = getSkillIndex(skill.id);
      const skillPath =
        skillIndex >= 0 ? `skills[${skillIndex}].name` : null;
      const content = (
        <EditableText
          value={skill.name}
          onChange={(value) =>
            skillPath
              ? updateTextField(skillPath, (current) => ({
                  ...current,
                  skills: current.skills.map((item) =>
                    item.id === skill.id
                      ? { ...item, name: value }
                      : item
                  ),
                }))
              : updateSkill(skill.id, { name: value })
          }
          placeholder="Skill"
          fieldPath={skillPath ?? undefined}
        />
      );

      return (
        <span className="group/skill relative inline-flex items-center">
          {skillPath ? renderWithFeedback(skillPath, content) : content}
          {!isPrintPreviewMode && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-full top-1/2 z-10 ml-0.5 h-4 w-4 -translate-y-1/2 text-muted-foreground opacity-0 transition group-hover/skill:opacity-100 hover:opacity-100 focus-visible:opacity-100 hover:text-destructive"
              onClick={() => removeSkill(skill.id)}
              aria-label="Remove skill"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </span>
      );
    };

    const renderCategoryLabel = (
      category: string,
      categorySkills: SkillEntry[]
    ) => {
      const firstSkill = categorySkills[0];
      const categoryIndex = firstSkill ? getSkillIndex(firstSkill.id) : -1;
      const categoryPath =
        categoryIndex >= 0 ? `skills[${categoryIndex}].category` : null;
      const content = (
        <EditableText
          value={category}
          onChange={(value) =>
            categoryPath
              ? updateTextField(categoryPath, (current) => ({
                  ...current,
                  skills: current.skills.map((item) =>
                    item.category.trim() === category.trim()
                      ? { ...item, category: value }
                      : item
                  ),
                }))
              : updateSkillCategory(category, value)
          }
          placeholder="Category"
          fieldPath={categoryPath ?? undefined}
        />
      );
      return categoryPath ? renderWithFeedback(categoryPath, content) : content;
    };

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
                style={resumeFontSizeStyles.body}
              >
                <span className="font-semibold">
                  {renderCategoryLabel(category, categorySkills)}
                  :
                </span>{" "}
                {categorySkills.map((skill, index) => (
                  <Fragment key={skill.id}>
                    {renderSkillItem(skill)}
                    {index < categorySkills.length - 1 && ", "}
                  </Fragment>
                ))}
              </p>
              {!isPrintPreviewMode && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  onClick={() => addSkill(category)}
                  aria-label={`Add skill to ${category}`}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              )}
            </div>
          )
        )}
        {ungroupedSkills.length > 0 && (
          <div className="flex items-start justify-between gap-2">
            <p
              className="text-gray-700 dark:text-gray-300"
              style={resumeFontSizeStyles.body}
            >
              {ungroupedSkills.map((skill, index) => (
                <Fragment key={skill.id}>
                  {renderSkillItem(skill)}
                  {index < ungroupedSkills.length - 1 && ", "}
                </Fragment>
              ))}
            </p>
            {!isPrintPreviewMode && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                onClick={() => addSkill("")}
                aria-label="Add skill"
              >
                <Plus className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderSkillsEmpty = () => (
    <p
      className="text-gray-500 dark:text-gray-400 italic"
      style={resumeFontSizeStyles.body}
    >
      Add skills using the buttons above.
    </p>
  );

  // Pagination hooks for resume and cover letter
  const resumePagination = usePagination({
    paperSize: resolvedPageSettings.paperSize,
    margins: resolvedPageSettings.resumeMargins,
    elementGap: resumeSpacing.entryGap,
    headerElementGap: resumeHeaderContentGap,
    contentToHeaderGap: resumeSpacing.sectionGap,
  });
  resumePaginationRecalculateRef.current = resumePagination.recalculate;

  const coverLetterPagination = usePagination({
    paperSize: resolvedPageSettings.paperSize,
    margins: resolvedPageSettings.coverLetterMargins,
    elementGap: 24, // space-y-6 = 1.5rem = 24px
  });
  coverLetterPaginationRecalculateRef.current = coverLetterPagination.recalculate;

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => {
      if (resolvedDocumentTab === "resume") {
        resumePaginationRecalculateRef.current?.();
      } else {
        coverLetterPaginationRecalculateRef.current?.();
      }
    });
    return () => window.cancelAnimationFrame(raf);
  }, [resolvedDocumentTab, resumeData]);

  const setResumeContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      resumeContentRef.current = node;
      resumePagination.containerRef.current = node;
    },
    [resumePagination.containerRef]
  );

  const resumeElementDefs = useMemo(() => {
    const defs: Array<{ id: string; isHeader: boolean }> = [];

    defs.push({ id: "header", isHeader: false });

    for (const section of orderedSections) {
      if (section === "summary" && sectionVisibility.summary) {
        defs.push({ id: "summary-header", isHeader: true });
        defs.push({ id: "summary-content", isHeader: false });
      } else if (section === "experience" && sectionVisibility.experience) {
        defs.push({ id: "experience-header", isHeader: true });
        if (experience.length === 0) {
          defs.push({ id: "experience-empty", isHeader: false });
        } else {
          for (const entry of experience) {
            defs.push({ id: `experience-${entry.id}`, isHeader: false });
          }
        }
      } else if (section === "projects" && sectionVisibility.projects) {
        defs.push({ id: "projects-header", isHeader: true });
        if (projects.length === 0) {
          defs.push({ id: "projects-empty", isHeader: false });
        } else {
          for (const project of projects) {
            defs.push({ id: `project-${project.id}`, isHeader: false });
          }
        }
      } else if (section === "education" && sectionVisibility.education) {
        defs.push({ id: "education-header", isHeader: true });
        if (education.length === 0) {
          defs.push({ id: "education-empty", isHeader: false });
        } else {
          for (const entry of education) {
            defs.push({ id: `education-${entry.id}`, isHeader: false });
          }
        }
      } else if (section === "skills" && sectionVisibility.skills) {
        defs.push({ id: "skills-header", isHeader: true });
        if (skills.length === 0) {
          defs.push({ id: "skills-empty", isHeader: false });
        } else {
          defs.push({ id: "skills-content", isHeader: false });
        }
      }
    }

    return defs;
  }, [
    orderedSections,
    sectionVisibility.summary,
    sectionVisibility.experience,
    sectionVisibility.projects,
    sectionVisibility.education,
    sectionVisibility.skills,
    experience,
    projects,
    education,
    skills,
  ]);

  const coverLetterElementDefs = useMemo(
    () => [
      { id: "cl-sender", isHeader: false },
      { id: "cl-date", isHeader: false },
      { id: "cl-recipient", isHeader: false },
      { id: "cl-body", isHeader: false },
    ],
    []
  );

  // Build the list of measurable elements for the resume (granular for proper pagination)
  const resumeElements = (() => {
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
            <h1
              className="font-bold text-gray-900 dark:text-gray-100"
              style={resumeFontSizeStyles.name}
            >
              {renderWithFeedback(
                "metadata.fullName",
                <EditableText
                  value={metadata.fullName}
                  onChange={(fullName) =>
                    updateTextField("metadata.fullName", (current) => ({
                      ...current,
                      metadata: {
                        ...current.metadata,
                        fullName,
                      },
                    }))
                  }
                  placeholder="Your Name"
                  fieldPath="metadata.fullName"
                />
              )}
            </h1>
            {renderInlineAlignment("Name", headerAlignment.name, (value) =>
              updateHeaderAlignment("name", value)
            )}
          </div>
          <div
            className={cn(
              "relative w-full group",
              getAlignmentClass(headerAlignment.subtitle)
            )}
            style={{ marginTop: `${resumeSpacing.nameGap}px` }}
          >
            <p
              className="font-medium text-gray-700 dark:text-gray-300"
              style={resumeFontSizeStyles.subtitle}
            >
              {renderWithFeedback(
                "metadata.subtitle",
                <EditableText
                  value={metadata.subtitle}
                  onChange={(subtitle) =>
                    updateTextField("metadata.subtitle", (current) => ({
                      ...current,
                      metadata: {
                        ...current.metadata,
                        subtitle,
                      },
                    }))
                  }
                  placeholder="Professional Title"
                  fieldPath="metadata.subtitle"
                />
              )}
            </p>
            {renderInlineAlignment("Subtitle", headerAlignment.subtitle, (value) =>
              updateHeaderAlignment("subtitle", value)
            )}
          </div>
          <div
            className={cn(
              "relative w-full group",
              getAlignmentClass(headerAlignment.contact)
            )}
            style={{ marginTop: `${resumeSpacing.contactGap}px` }}
          >
            <p
              className="text-gray-600 dark:text-gray-400"
              style={resumeFontSizeStyles.contact}
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

                const contactItems: ContactItem[] = [];
                for (const key of contactOrder) {
                  const field = contactFieldMap[key];
                  if (!field) continue;
                  const value = metadata.contactInfo[key] ?? "";
                  if (field.optional && value.trim().length === 0) {
                    continue;
                  }
                  const feedbackPath = `metadata.contactInfo.${key}`;
                  const onChange = (nextValue: string) =>
                    updateTextField(feedbackPath, (current) => ({
                      ...current,
                      metadata: {
                        ...current.metadata,
                        contactInfo: {
                          ...current.metadata.contactInfo,
                          [key]: nextValue,
                        },
                      },
                    }));
                  contactItems.push({
                    key,
                    value,
                    placeholder: field.placeholder,
                    onChange,
                    link: field.link,
                    href: field.link ? normalizeProfileUrl(value) : "",
                  });
                }

                return contactItems.map((item, index) => (
                  <Fragment key={item.key}>
                    {(() => {
                      const feedbackPath = `metadata.contactInfo.${item.key}`;
                      const hasCustomHyperlinks =
                        (hyperlinksByPath.get(feedbackPath)?.length ?? 0) > 0;
                      const input = (
                        <EditableText
                          value={item.value}
                          onChange={item.onChange}
                          placeholder={item.placeholder}
                          fieldPath={feedbackPath}
                        />
                      );
                      const node = item.link && !hasCustomHyperlinks ? (
                        <a
                          href={item.href}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline underline-offset-2"
                          onClick={(event) => event.preventDefault()}
                        >
                          {input}
                        </a>
                      ) : (
                        input
                      );
                      return renderWithFeedback(feedbackPath, node);
                    })()}
                    {index < contactItems.length - 1 && (
                      <span className="text-gray-400"> | </span>
                    )}
                  </Fragment>
                ));
              })()}
            </p>
            {renderInlineAlignment("Contact", headerAlignment.contact, (value) =>
              updateHeaderAlignment("contact", value)
            )}
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
          for (const [index, entry] of experience.entries()) {
            elements.push({
              id: `experience-${entry.id}`,
              isHeader: false,
              render: () => renderExperienceItem(entry, index),
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
          for (const [index, project] of projects.entries()) {
            elements.push({
              id: `project-${project.id}`,
              isHeader: false,
              render: () => renderProjectItem(project, index),
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
          for (const [index, entry] of education.entries()) {
            elements.push({
              id: `education-${entry.id}`,
              isHeader: false,
              render: () => renderEducationItem(entry, index),
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
  })();

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
            style={coverLetterFontSizeStyles.body}
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
            style={coverLetterFontSizeStyles.itemMeta}
          >
            <EditableText
              value={coverLetter.date}
              onChange={(date) => updateCoverLetter({ date })}
              placeholder="YYYY-MM-DD"
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
            style={coverLetterFontSizeStyles.body}
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
            style={coverLetterFontSizeStyles.body}
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
            style={coverLetterFontSizeStyles.body}
            multiline
          />
          <p
            className="text-gray-700 dark:text-gray-300"
            style={coverLetterFontSizeStyles.body}
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
  }, [
    metadata,
    coverLetter,
    coverLetterFontSizeStyles,
    updateContactInfo,
    updateCoverLetter,
    updateMetadata,
  ]);

  // Register elements with pagination hooks
  useEffect(() => {
    resumePagination.setElements(resumeElementDefs);
  }, [resumeElementDefs, resumePagination]);

  useEffect(() => {
    coverLetterPagination.setElements(coverLetterElementDefs);
  }, [coverLetterElementDefs, coverLetterPagination]);

  // Map element IDs to their page assignments, defaulting to page 0 for unmeasured elements
  const resumeElementPages = useMemo(() => {
    const map = new Map<string, number>();
    // First, assign all elements to page 0 as default
    for (const el of resumeElementDefs) {
      map.set(el.id, 0);
    }
    // Then, update with actual page assignments from pagination
    for (const page of resumePagination.pages) {
      for (const el of page.elements) {
        map.set(el.id, page.pageIndex);
      }
    }
    return map;
  }, [resumePagination.pages, resumeElementDefs]);

  const coverLetterElementPages = useMemo(() => {
    const map = new Map<string, number>();
    // First, assign all elements to page 0 as default
    for (const el of coverLetterElementDefs) {
      map.set(el.id, 0);
    }
    // Then, update with actual page assignments from pagination
    for (const page of coverLetterPagination.pages) {
      for (const el of page.elements) {
        map.set(el.id, page.pageIndex);
      }
    }
    return map;
  }, [coverLetterPagination.pages, coverLetterElementDefs]);

  const getPageHeightPx = useCallback(
    (pageDimensions: { pageHeightPx: number } | null) => {
      return pageDimensions?.pageHeightPx ?? paperMetrics.paperHeightPx;
    },
    [paperMetrics.paperHeightPx]
  );

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

  const resumePageCount = resumePageIndices.length;
  const coverLetterPageCount = coverLetterPageIndices.length;
  const resumePageHeightPx = getPageHeightPx(resumePagination.pageDimensions);
  const coverLetterPageHeightPx = getPageHeightPx(
    coverLetterPagination.pageDimensions
  );
  const resumeScale = useMemo(() => {
    if (!autoScaleToFit) return 1;
    if (resumeViewportWidth <= 0) return 1;
    return Math.min(1, resumeViewportWidth / paperMetrics.paperWidthPx);
  }, [autoScaleToFit, paperMetrics.paperWidthPx, resumeViewportWidth]);
  const coverLetterScale = useMemo(() => {
    if (!autoScaleToFit) return 1;
    if (coverLetterViewportWidth <= 0) return 1;
    return Math.min(1, coverLetterViewportWidth / paperMetrics.paperWidthPx);
  }, [autoScaleToFit, coverLetterViewportWidth, paperMetrics.paperWidthPx]);
  const scaledResumeGapPx = autoScaleToFit ? Math.max(10, 32 * resumeScale) : 32;
  const scaledCoverLetterGapPx = autoScaleToFit
    ? Math.max(10, 32 * coverLetterScale)
    : 32;
  const resumePageOverflow = Boolean(
    maxResumePages && resumePageCount > maxResumePages
  );
  const coverLetterPageOverflow = coverLetterPageCount > 1;

  useEffect(() => {
    if (!onPageCountChange) return;
    if (!isPrintPreviewMode) {
      onPageCountChange({
        resumePages: 0,
        coverLetterPages: 0,
        isPrintPreviewMode: false,
      });
      return;
    }
    onPageCountChange({
      resumePages: resumePageCount,
      coverLetterPages: coverLetterPageCount,
      isPrintPreviewMode: true,
    });
  }, [
    onPageCountChange,
    resumePageCount,
    coverLetterPageCount,
    isPrintPreviewMode,
  ]);

  // Pre-create ref callbacks to satisfy eslint
  const resumeRefCallbacks = useMemo(() => {
    const callbacks = new Map<string, (el: HTMLElement | null) => void>();
    for (const el of resumeElementDefs) {
      callbacks.set(el.id, resumePagination.measureRef(el.id));
    }
    return callbacks;
  }, [resumeElementDefs, resumePagination]);

  const coverLetterRefCallbacks = useMemo(() => {
    const callbacks = new Map<string, (el: HTMLElement | null) => void>();
    for (const el of coverLetterElementDefs) {
      callbacks.set(el.id, coverLetterPagination.measureRef(el.id));
    }
    return callbacks;
  }, [coverLetterElementDefs, coverLetterPagination]);

  const bulkLineConstraints = useMemo(() => {
    if (bulkScope.type !== "selection" || bulkMaxLines < 1) {
      return [] as Array<{ path: string; constraint: FieldLengthConstraint }>;
    }
    const constraints = buildFieldLengthConstraints(bulkFields, bulkMaxLines);
    return bulkFields.flatMap((field) => {
      const constraint = constraints.get(field.path);
      return constraint ? [{ path: field.path, constraint }] : [];
    });
  }, [buildFieldLengthConstraints, bulkFields, bulkMaxLines, bulkScope.type]);

  const bulkLineConstraintSummary = useMemo(() => {
    if (bulkLineConstraints.length === 0) return null;
    let minCharsPerLine = Number.POSITIVE_INFINITY;
    let minTotalChars = Number.POSITIVE_INFINITY;
    for (const item of bulkLineConstraints) {
      minCharsPerLine = Math.min(
        minCharsPerLine,
        item.constraint.maxCharsPerLine
      );
      minTotalChars = Math.min(minTotalChars, item.constraint.maxCharsTotal);
    }
    return {
      minCharsPerLine,
      minTotalChars,
      constrainedCount: bulkLineConstraints.length,
    };
  }, [bulkLineConstraints]);

  return (
    <HyperlinkContext.Provider
      value={{
        isPrintPreviewMode,
        isReadOnly: readOnly,
        highlightPaths: highlightPathSet,
        impliedHighlightPaths: impliedHighlightPathSet,
        highlightTone,
        hyperlinksByPath,
        hyperlinkUnderlineEnabled: resolvedLayoutPreferences.hyperlinkUnderline,
        onWholeFieldHyperlinkEditStart: handleWholeFieldHyperlinkEditStart,
        onWholeFieldHyperlinkEditEnd: handleWholeFieldHyperlinkEditEnd,
      }}
    >
      <div className={cn("relative flex h-full flex-col", isPrintPreviewMode && "print-preview-mode")}>
        {selectionState && selectionAnchor && !isBulkOpen && !isPrintPreviewMode && (
          <div
            className="fixed z-40 flex items-center gap-1"
            style={{ top: selectionAnchor.top, left: selectionAnchor.left }}
          >
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="h-8 w-8 shadow-md"
              onClick={() => {
                openBulkPanel({
                  fields: selectionState.fields,
                  targetLabel: `Selection (${selectionState.fields.length})`,
                  scope: { type: "selection" },
                });
              }}
              aria-label="Rewrite selection with AI"
            >
              <Sparkles className="h-4 w-4" />
            </Button>
            {hyperlinkSelection && (
              <Button
                type="button"
                variant={isHyperlinkPanelOpen ? "default" : "secondary"}
                size="icon"
                className="h-8 w-8 shadow-md"
                onClick={() => {
                  if (isHyperlinkPanelOpen) {
                    setIsHyperlinkPanelOpen(false);
                    setHyperlinkError(null);
                    return;
                  }
                  openHyperlinkPanel();
                }}
                aria-label="Add hyperlink to selected text"
              >
                <Link2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
        {isHyperlinkPanelOpen &&
          hyperlinkSelection &&
          selectionAnchor &&
          !isBulkOpen &&
          !isPrintPreviewMode && (
            <div
              className="fixed z-40 w-[min(360px,calc(100vw-1rem))] rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-xl"
              style={{
                top: selectionAnchor.top + 40,
                left: clamp(
                  selectionAnchor.left,
                  8,
                  typeof window === "undefined"
                    ? selectionAnchor.left
                    : window.innerWidth -
                        Math.min(360, window.innerWidth - 16) -
                        8
                ),
              }}
            >
              <p className="text-xs font-medium">Hyperlink Selection</p>
              <p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">
                {`"${hyperlinkSelection.text}"`}
              </p>
              <Input
                value={hyperlinkDraft}
                onChange={(event) => {
                  setHyperlinkDraft(event.target.value);
                  setHyperlinkError(null);
                }}
                placeholder="https://example.com"
                className="mt-2 h-8 text-xs"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    applyHyperlinkToSelection();
                  }
                }}
              />
              <div className="mt-2 flex items-center justify-between">
                <span
                  className={cn(
                    "text-[10px]",
                    hyperlinkError ? "text-destructive" : "text-muted-foreground"
                  )}
                >
                  {hyperlinkError || "Supports https://, mailto:, tel:, or bare domains."}
                </span>
                <div className="flex items-center gap-1">
                  {selectedHyperlink && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      onClick={removeHyperlinkFromSelection}
                    >
                      Remove
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={applyHyperlinkToSelection}
                    disabled={!hyperlinkDraft.trim()}
                  >
                    {selectedHyperlink ? "Update Link" : "Apply Link"}
                  </Button>
                </div>
              </div>
            </div>
          )}
      {isBulkOpen && !isPrintPreviewMode && (
        <div
          className="absolute left-2 right-2 z-40 w-auto rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-xl sm:left-auto sm:right-4 sm:w-[380px]"
          style={{ top: `${bulkPanelTop}px` }}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium">
              {bulkTargetLabel || "Selection"}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setIsBulkCollapsed((current) => !current)}
                aria-label={isBulkCollapsed ? "Expand suggestions" : "Collapse suggestions"}
              >
                {isBulkCollapsed ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={() => {
                  setIsBulkOpen(false);
                  setBulkOps([]);
                  setBulkError(null);
                  setBulkPrompt("");
                  setIsBulkCollapsed(false);
                  setActiveAiTarget(null);
                  if (!selectionState) {
                    clearSelectionState();
                  }
                }}
              >
                Close
              </Button>
            </div>
          </div>
          {!isBulkCollapsed && (
            <>
              <div className="mt-2 space-y-2">
                <Input
                  value={bulkPrompt}
                  onChange={(event) => setBulkPrompt(event.target.value)}
                  placeholder="Tell AI what to improve..."
                  className="h-8 text-xs"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      requestBulkRewrite(
                        bulkPrompt,
                        bulkFields,
                        bulkScope,
                        bulkScope.type === "selection" ? bulkMaxLines : 0
                      );
                    }
                  }}
                />
                {bulkScope.type === "selection" && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-muted-foreground">
                        Max lines per field
                      </span>
                      <ToggleGroup
                        type="single"
                        value={bulkMaxLines > 0 ? String(bulkMaxLines) : "off"}
                        onValueChange={(value) => {
                          if (!value || value === "off") {
                            setBulkMaxLines(0);
                            return;
                          }
                          const parsed = Number.parseInt(value, 10);
                          setBulkMaxLines(Number.isFinite(parsed) ? parsed : 0);
                        }}
                        size="sm"
                        variant="outline"
                        className="justify-start"
                      >
                        <ToggleGroupItem value="off" className="h-6 px-2 text-[10px]">
                          Off
                        </ToggleGroupItem>
                        {MAX_LINES_OPTIONS.map((option) => (
                          <ToggleGroupItem
                            key={option}
                            value={String(option)}
                            className="h-6 w-6 px-0 text-[10px]"
                          >
                            {option}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                    </div>
                    {bulkLineConstraintSummary && (
                      <p className="text-[10px] text-muted-foreground">
                        Budget: at least {bulkLineConstraintSummary.minCharsPerLine}
                        {" "}chars/line and {bulkLineConstraintSummary.minTotalChars}
                        {" "}chars total across{" "}
                        {bulkLineConstraintSummary.constrainedCount} field
                        {bulkLineConstraintSummary.constrainedCount === 1 ? "" : "s"}.
                      </p>
                    )}
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "text-[10px]",
                      bulkError ? "text-destructive" : "text-muted-foreground"
                    )}
                  >
                    {bulkError ||
                      (bulkFields.length > 0
                        ? `${bulkFields.length} selected fields`
                        : "Select resume text to begin.")}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={() =>
                      requestBulkRewrite(
                        bulkPrompt,
                        bulkFields,
                        bulkScope,
                        bulkScope.type === "selection" ? bulkMaxLines : 0
                      )
                    }
                    disabled={bulkLoading || !bulkPrompt.trim()}
                  >
                    {bulkLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      "Generate"
                    )}
                  </Button>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {bulkOps.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    {bulkLoading
                      ? "Generating AI edits..."
                      : "No AI edits yet. Submit an instruction to generate changes."}
                  </p>
                ) : (
                  bulkOps.map((op) => (
                    <div
                      key={op.id}
                      className="rounded-md border border-border/60 bg-background/80 p-2"
                    >
                      <p className="text-[11px] font-medium text-foreground">
                        {op.op === "replace"
                          ? "Replace text"
                          : op.op === "delete"
                            ? "Remove item"
                            : "Add item"}
                      </p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {op.path}
                      </p>
                      {(op.op === "replace" || op.op === "insert") && (
                        <p className="mt-2 text-[11px] text-foreground">
                          {op.value}
                        </p>
                      )}
                      <div className="mt-2 flex items-center justify-end gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                          onClick={() => rejectBulkOperation(op.id)}
                        >
                          Reject
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                          onClick={() => acceptBulkOperation(op.id)}
                        >
                          Accept
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
          {isBulkCollapsed && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Suggestions hidden. Expand to review.
            </p>
          )}
        </div>
      )}
      {isDebugOpen && (
        <div className="absolute left-2 right-2 top-[60px] z-40 w-auto rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-xl sm:left-auto sm:right-4 sm:w-[360px]">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium">Debug</p>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={copyDebugJson}
                disabled={!activeDebugJson}
              >
                {didCopyDebugJson ? "Copied" : "Copy JSON"}
              </Button>
              {activeDebugTab === "resume-json" ? (
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  onClick={applyDebugResumeJson}
                  disabled={readOnly || !resumeDebugJsonDraft.trim()}
                  title={
                    readOnly
                      ? "Cannot replace JSON in read-only mode"
                      : "Replace the current resume with this JSON"
                  }
                >
                  {didApplyDebugJson ? "Applied" : "Apply JSON"}
                </Button>
              ) : null}
              {onApplyDebugChanges ? (
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  onClick={onApplyDebugChanges}
                >
                  Apply Draft
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={() => handleSetDebugOpen(false)}
              >
                Close
              </Button>
            </div>
          </div>
          <Tabs
            value={activeDebugTab}
            onValueChange={(value) => {
              setActiveDebugTab(value as "resume-json" | "llm-raw");
              setDidCopyDebugJson(false);
              setDidApplyDebugJson(false);
              setDebugReplaceError(null);
            }}
            className="mt-2"
          >
            <TabsList className="h-8 w-full justify-start gap-1 overflow-x-auto">
              <TabsTrigger value="resume-json" className="h-6 px-2 text-[10px]">
                Resume JSON
              </TabsTrigger>
              <TabsTrigger value="llm-raw" className="h-6 px-2 text-[10px]">
                LLM Raw Output
              </TabsTrigger>
            </TabsList>
            <TabsContent value="resume-json" className="mt-2">
              <Textarea
                value={resumeDebugJsonDraft}
                onChange={(event) => {
                  setResumeDebugJsonDraft(event.target.value);
                  if (debugReplaceError) setDebugReplaceError(null);
                  if (didApplyDebugJson) setDidApplyDebugJson(false);
                }}
                spellCheck={false}
                className="h-80 resize-y font-mono text-[10px] leading-relaxed"
              />
              {debugReplaceError ? (
                <p className="mt-2 text-[11px] text-destructive">
                  {debugReplaceError}
                </p>
              ) : (
                <p className="mt-2 text-[10px] text-muted-foreground">
                  Paste a full or partial resume JSON object. Missing fields will
                  be added from the default resume shape when you click Apply JSON.
                </p>
              )}
            </TabsContent>
            <TabsContent value="llm-raw" className="mt-2">
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-[10px] text-muted-foreground">
                {rawDebugJson || "No analysis yet."}
              </pre>
            </TabsContent>
          </Tabs>
        </div>
      )}
      <Tabs
        value={resolvedDocumentTab}
        onValueChange={(value) =>
          handleDocumentTabChange(value as "resume" | "cover-letter")
        }
        className="flex h-full flex-col"
      >
        {shouldShowTopBar ? (
          <div className="flex min-h-[52px] flex-wrap items-center gap-2 border-b border-border px-3 py-2 sm:h-[52px] sm:flex-nowrap sm:px-4 sm:py-0">
            {shouldShowDocumentControl ? (
              documentTabControl === "select" ? (
                <ToggleGroup
                  type="single"
                  value={resolvedDocumentTab}
                  onValueChange={(value) =>
                    value
                      ? handleDocumentTabChange(
                          value as "resume" | "cover-letter"
                        )
                      : undefined
                  }
                  className="h-8 rounded-md border border-border/70 bg-muted/30 p-1"
                >
                  <ToggleGroupItem value="resume" className="h-6 px-3 text-[11px]">
                    Resume
                  </ToggleGroupItem>
                  {canShowCoverLetterTab ? (
                    <ToggleGroupItem
                      value="cover-letter"
                      className="h-6 px-3 text-[11px]"
                    >
                      Cover Letter
                    </ToggleGroupItem>
                  ) : null}
                </ToggleGroup>
              ) : (
                <TabsList className="h-9 flex-1 justify-start gap-3 overflow-x-auto bg-transparent p-0 text-foreground sm:h-12 sm:gap-4">
                  <TabsTrigger
                    value="resume"
                    className="shrink-0 rounded-none px-0 py-2 text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none sm:pb-3 sm:pt-3"
                  >
                    Resume
                  </TabsTrigger>
                  {canShowCoverLetterTab ? (
                    <TabsTrigger
                      value="cover-letter"
                      className="shrink-0 rounded-none px-0 py-2 text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none sm:pb-3 sm:pt-3"
                    >
                      Cover Letter
                    </TabsTrigger>
                  ) : null}
                </TabsList>
              )
            ) : null}
            {shouldShowToolbarActions || toolbarActionsSlot ? (
              <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto sm:gap-2">
                {toolbarActionsSlot}
                {shouldShowToolbarActions ? (
                  <>
                    {maxResumePages && isPrintPreviewMode ? (
                      <div
                        className={cn(
                          "rounded border px-2 py-1 text-[10px]",
                          resumePageOverflow
                            ? "border-destructive/50 bg-destructive/10 text-destructive"
                            : "border-border bg-muted/30 text-muted-foreground"
                        )}
                      >
                        Resume {resumePageCount}/{maxResumePages}
                      </div>
                    ) : null}
                    {maxResumePages && isPrintPreviewMode ? (
                      <div
                        className={cn(
                          "rounded border px-2 py-1 text-[10px]",
                          coverLetterPageOverflow
                            ? "border-destructive/50 bg-destructive/10 text-destructive"
                            : "border-border bg-muted/30 text-muted-foreground"
                        )}
                      >
                        Cover {coverLetterPageCount}/1
                      </div>
                    ) : null}
                    {maxResumePages && !isPrintPreviewMode ? (
                      <div className="hidden rounded border border-border bg-muted/30 px-2 py-1 text-[10px] text-muted-foreground sm:block">
                        Enable Print Preview for export page count
                      </div>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1.5 px-2 text-[11px]"
                      onClick={exportResumeAsPdf}
                      disabled={isExportingPdf}
                    >
                      {isExportingPdf ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <FileDown className="h-3.5 w-3.5" />
                      )}
                      {isExportingPdf ? "Preparing..." : "Export PDF"}
                    </Button>
                    <Button
                      variant={isPrintPreviewMode ? "secondary" : "ghost"}
                      size="sm"
                      className="h-7 gap-1.5 px-2 text-[11px]"
                      onClick={handleTogglePrintPreview}
                      aria-label={
                        isPrintPreviewMode
                          ? "Exit print preview mode"
                          : "Enable print preview mode"
                      }
                      aria-pressed={isPrintPreviewMode}
                    >
                      {isPrintPreviewMode ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                      {isPrintPreviewMode ? "Exit Preview" : "Print Preview"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      onClick={handleToggleDebug}
                    >
                      {isDebugOpen ? "Hide Debug" : "Debug"}
                    </Button>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <ScrollArea className="flex-1">
          <div className="flex justify-center p-3 sm:p-8">
            <TabsContent
              value="resume"
              className="mt-0 w-full"
              style={{ maxWidth: paperMetrics.paperMaxWidth }}
            >
              <div ref={resumeViewportRef} className="w-full">
                <div
                  className="mx-auto"
                  style={
                    autoScaleToFit
                      ? { width: `${paperMetrics.paperWidthPx * resumeScale}px` }
                      : undefined
                  }
                >
                  <div
                    ref={setResumeContainerRef}
                    className="resume-pages flex flex-col"
                    style={{
                      width: autoScaleToFit
                        ? `${paperMetrics.paperWidthPx}px`
                        : undefined,
                      gap: `${scaledResumeGapPx}px`,
                    }}
                    onMouseUp={collectSelectedFields}
                    onKeyUp={collectSelectedFields}
                  >
                    {resumePageIndices.map((pageIndex) => (
                      <div
                        key={pageIndex}
                        className={cn(autoScaleToFit && "mx-auto")}
                        style={
                          autoScaleToFit
                            ? {
                                width: `${paperMetrics.paperWidthPx * resumeScale}px`,
                                height: `${resumePageHeightPx * resumeScale}px`,
                              }
                            : undefined
                        }
                      >
                        <div
                          className="document-paper rounded-sm overflow-visible"
                          style={{
                            ...resumePaperStyle,
                            ...resumeTypographyStyle,
                            width: autoScaleToFit
                              ? `${paperMetrics.paperWidthPx}px`
                              : undefined,
                            height: `${resumePageHeightPx}px`,
                            transform: autoScaleToFit
                              ? `scale(${resumeScale})`
                              : undefined,
                            transformOrigin: autoScaleToFit
                              ? "top left"
                              : undefined,
                          }}
                        >
                          <div className="flex flex-col">
                            {(() => {
                              const pageElements = resumeElements.filter(
                                (el) => resumeElementPages.get(el.id) === pageIndex
                              );
                              return pageElements.map((element, index) => (
                                (() => {
                                  const previousElement = pageElements[index - 1];
                                  const marginTop =
                                    index === 0
                                      ? 0
                                      : element.isHeader
                                        ? resumeSpacing.sectionGap
                                        : previousElement?.isHeader
                                          ? resumeHeaderContentGap
                                          : resumeSpacing.entryGap;

                                  return (
                                <div
                                  key={element.id}
                                  ref={resumeRefCallbacks.get(element.id)}
                                  style={
                                    marginTop > 0
                                      ? { marginTop: `${marginTop}px` }
                                      : undefined
                                  }
                                >
                                  {element.render()}
                                </div>
                                  );
                                })()
                              ));
                            })()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </TabsContent>

            {canShowCoverLetterTab ? (
              <TabsContent
                value="cover-letter"
                className="mt-0 w-full"
                style={{ maxWidth: paperMetrics.paperMaxWidth }}
              >
                <div ref={coverLetterViewportRef} className="w-full">
                  <div
                    className="mx-auto"
                    style={
                      autoScaleToFit
                        ? {
                            width: `${paperMetrics.paperWidthPx * coverLetterScale}px`,
                          }
                        : undefined
                    }
                  >
                    <div
                      ref={coverLetterPagination.containerRef}
                      className="cover-letter-pages flex flex-col"
                      style={{
                        width: autoScaleToFit
                          ? `${paperMetrics.paperWidthPx}px`
                          : undefined,
                        gap: `${scaledCoverLetterGapPx}px`,
                      }}
                    >
                      {coverLetterPageIndices.map((pageIndex) => (
                        <div
                          key={pageIndex}
                          className={cn(autoScaleToFit && "mx-auto")}
                          style={
                            autoScaleToFit
                              ? {
                                  width: `${paperMetrics.paperWidthPx * coverLetterScale}px`,
                                  height: `${coverLetterPageHeightPx * coverLetterScale}px`,
                                }
                              : undefined
                          }
                        >
                          <div
                            className="document-paper rounded-sm overflow-visible"
                            style={{
                              ...coverLetterPaperStyle,
                              ...coverLetterTypographyStyle,
                              width: autoScaleToFit
                                ? `${paperMetrics.paperWidthPx}px`
                                : undefined,
                              height: `${coverLetterPageHeightPx}px`,
                              transform: autoScaleToFit
                                ? `scale(${coverLetterScale})`
                                : undefined,
                              transformOrigin: autoScaleToFit
                                ? "top left"
                                : undefined,
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
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </TabsContent>
            ) : null}
          </div>
        </ScrollArea>
      </Tabs>
      </div>
    </HyperlinkContext.Provider>
  );
}
