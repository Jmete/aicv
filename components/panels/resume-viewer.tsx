"use client";

import {
  Fragment,
  useCallback,
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
import { DEFAULT_LAYOUT_PREFERENCES, PAPER_DIMENSIONS } from "@/lib/resume-defaults";
import {
  applyReplacementTemplate,
  parseFieldPath,
  setResumeValueAtPath,
} from "@/lib/resume-analysis";
import { cn } from "@/lib/utils";
import type {
  ContactFieldKey,
  FontFamily,
  HeaderAlignment,
  ResumeData,
  ResumeAnalysisState,
  SectionKey,
  SkillEntry,
  TextAlignment,
} from "@/types";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  X,
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

const FONT_FAMILY_MAP: Record<FontFamily, string> = {
  serif: "Georgia, 'Times New Roman', serif",
  sans: "var(--font-geist-sans), system-ui, sans-serif",
  mono: "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
};

const AI_SUGGESTIONS = [
  "Make this shorter",
  "Sound more professional",
  "Add impact metrics",
  "Clarify the scope",
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

function EditableText({
  value,
  onChange,
  placeholder = "",
  className,
  style,
  multiline = false,
  fieldPath,
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
      data-field-path={fieldPath}
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

interface InlineAiAssistProps {
  isOpen: boolean;
  onToggle: () => void;
  onSubmit: (prompt: string) => void;
  isLoading?: boolean;
  error?: string | null;
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  panelClassName?: string;
}

function InlineAiAssist({
  isOpen,
  onToggle,
  onSubmit,
  isLoading = false,
  error,
  placeholder = "Ask AI to refine this...",
  className,
  triggerClassName,
  panelClassName,
}: InlineAiAssistProps) {
  const [prompt, setPrompt] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  const applySuggestion = (suggestion: string) => {
    setPrompt(suggestion);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const submit = () => {
    const trimmed = prompt.trim();
    if (!trimmed || isLoading) return;
    onSubmit(trimmed);
    setPrompt("");
  };

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
          if (isOpen) {
            setPrompt("");
          }
          onToggle();
        }}
        aria-label="AI suggestions"
      >
        <Sparkles className="h-3.5 w-3.5" />
      </Button>
      {isOpen && (
        <div
          className={cn(
            "absolute right-0 top-full z-50 mt-2 w-72 rounded-md border border-border bg-white p-2 shadow-lg",
            panelClassName
          )}
        >
          <Input
            ref={inputRef}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={placeholder}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submit();
              }
            }}
            className="h-8 rounded-sm bg-white text-[11px] text-gray-900 placeholder:text-gray-500 focus-visible:ring-1 dark:bg-white dark:text-gray-900"
          />
          <div className="mt-2 flex flex-wrap gap-1">
            {AI_SUGGESTIONS.map((suggestion) => (
              <Button
                key={suggestion}
                type="button"
                variant="outline"
                size="sm"
                className="h-6 rounded-full border-neutral-200 bg-white px-2.5 text-[10px] font-medium text-gray-700 hover:bg-neutral-100 hover:text-gray-900 dark:border-neutral-200 dark:bg-white dark:text-gray-700 dark:hover:bg-neutral-100"
                onClick={() => applySuggestion(suggestion)}
              >
                {suggestion}
              </Button>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span
              className={cn(
                "text-[10px]",
                error ? "text-destructive" : "text-muted-foreground"
              )}
            >
              {error || "Press Enter to run."}
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-6 px-2 text-[10px]"
              onClick={submit}
              disabled={isLoading || !prompt.trim()}
            >
              {isLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                "Generate"
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

interface StaticTextProps {
  value: string;
  className?: string;
  style?: CSSProperties;
  multiline?: boolean;
  fieldPath?: string;
}

function StaticText({
  value,
  className,
  style,
  multiline = false,
  fieldPath,
}: StaticTextProps) {
  return (
    <span
      className={cn(
        multiline
          ? "block whitespace-pre-line break-words"
          : "inline-block max-w-full break-words align-baseline",
        className
      )}
      style={style}
      data-field-path={fieldPath}
    >
      {value}
    </span>
  );
}

interface AiDecisionButtonsProps {
  onAccept: () => void;
  onReject: () => void;
  className?: string;
}

function AiDecisionButtons({
  onAccept,
  onReject,
  className,
}: AiDecisionButtonsProps) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-5 w-5 text-emerald-600 hover:text-emerald-700"
        onClick={onAccept}
        aria-label="Accept AI replacement"
      >
        <Check className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-5 w-5 text-rose-600 hover:text-rose-700"
        onClick={onReject}
        aria-label="Reject AI replacement"
      >
        <X className="h-3.5 w-3.5" />
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

type AiSuggestion = {
  original: string;
  replacement: string;
};

type SelectedField = {
  path: string;
  text: string;
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

const SECTION_LABELS: Record<SectionKey, string> = {
  summary: "Summary",
  experience: "Experience",
  projects: "Projects",
  education: "Education",
  skills: "Skills",
};

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
    [onApplySuggestion, pickFeedback]
  );

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
      coverLetterFontPreferences: {
        ...DEFAULT_LAYOUT_PREFERENCES.coverLetterFontPreferences,
        ...layoutPreferences?.coverLetterFontPreferences,
        sizes: {
          ...DEFAULT_LAYOUT_PREFERENCES.coverLetterFontPreferences.sizes,
          ...layoutPreferences?.coverLetterFontPreferences?.sizes,
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

  const [todayFormatted, setTodayFormatted] = useState("");
  const [activeAiTarget, setActiveAiTarget] = useState<string | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<Record<string, AiSuggestion>>(
    {}
  );
  const [aiLoading, setAiLoading] = useState<Record<string, boolean>>({});
  const [aiErrors, setAiErrors] = useState<Record<string, string>>({});
  const [selectionState, setSelectionState] = useState<{
    fields: SelectedField[];
    rect: DOMRect;
  } | null>(null);
  const [bulkFields, setBulkFields] = useState<SelectedField[]>([]);
  const [bulkOps, setBulkOps] = useState<BulkOperation[]>([]);
  const [bulkPrompt, setBulkPrompt] = useState("");
  const [bulkTargetLabel, setBulkTargetLabel] = useState("");
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [isBulkCollapsed, setIsBulkCollapsed] = useState(false);
  const [bulkScope, setBulkScope] = useState<{
    type: "selection" | "section";
    section?: SectionKey;
  }>({ type: "selection" });
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const rawDebugJson = useMemo(
    () => (analysis?.raw ? JSON.stringify(analysis.raw, null, 2) : ""),
    [analysis]
  );
  const resumeContentRef = useRef<HTMLDivElement>(null);
  const bulkPanelTop = isDebugOpen ? 120 : 60;

  useEffect(() => {
    setTodayFormatted(
      new Date().toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    );
  }, []);

  const toggleAiTarget = (key: string) => {
    setActiveAiTarget((current) => (current === key ? null : key));
  };

  const updateAiLoading = (key: string, value: boolean) => {
    setAiLoading((current) => {
      const next = { ...current };
      if (value) {
        next[key] = true;
      } else {
        delete next[key];
      }
      return next;
    });
  };

  const updateAiError = (key: string, message: string | null) => {
    setAiErrors((current) => {
      const next = { ...current };
      if (message) {
        next[key] = message;
      } else {
        delete next[key];
      }
      return next;
    });
  };

  const clearAiSuggestion = (key: string) => {
    setAiSuggestions((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    updateAiError(key, null);
  };

  const requestAiReplacement = async (
    key: string,
    text: string,
    instruction: string,
    context: Record<string, unknown>
  ) => {
    if (aiLoading[key]) return;
    if (!text.trim()) {
      updateAiError(key, "Add text before asking AI to rewrite.");
      return;
    }

    updateAiError(key, null);
    updateAiLoading(key, true);

    try {
      const response = await fetch("/api/inline-rewrite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          instruction,
          context,
        }),
      });

      const rawText = await response.text();
      let payload: InlineRewriteResponse | null = null;
      try {
        payload = rawText ? (JSON.parse(rawText) as InlineRewriteResponse) : null;
      } catch {
        payload = null;
      }

      if (!response.ok) {
        throw new Error(payload?.error || "Failed to rewrite text.");
      }

      const replacement = payload?.replacement?.trim();
      if (!replacement) {
        throw new Error("AI returned an empty replacement.");
      }

      setAiSuggestions((current) => ({
        ...current,
        [key]: {
          original: text,
          replacement,
        },
      }));
      setActiveAiTarget(null);
    } catch (error) {
      updateAiError(
        key,
        error instanceof Error ? error.message : "Failed to rewrite text."
      );
    } finally {
      updateAiLoading(key, false);
    }
  };

  const acceptAiSuggestion = (
    key: string,
    apply: (value: string) => void
  ) => {
    const suggestion = aiSuggestions[key];
    if (!suggestion) return;
    apply(suggestion.replacement);
    clearAiSuggestion(key);
  };

  const clearSelectionState = () => {
    setSelectionState(null);
  };

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

    for (const element of elements) {
      if (!range.intersectsNode(element)) continue;
      const path = element.dataset.fieldPath;
      if (!path || seen.has(path)) continue;
      const text = (element.textContent ?? "").trim();
      fields.push({ path, text });
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
  }, [isBulkOpen]);

  const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

  const selectionAnchor = useMemo(() => {
    if (!selectionState) return null;
    if (typeof window === "undefined") return null;
    const rect = selectionState.rect;
    const padding = 8;
    const width = 32;
    const height = 32;
    const left = clamp(rect.right + padding, 8, window.innerWidth - width - 8);
    const top = clamp(rect.top - height - padding, 8, window.innerHeight - height - 8);
    return { left, top };
  }, [selectionState]);

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
        { path: `projects[${index}].description`, text: project.description },
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
        ];
        if (!replaceTypes.includes(operation.itemType)) return [];
        return [{ ...operation, id: crypto.randomUUID() }];
      }
      if (operation.op === "delete") {
        if (!allowedDeletes.has(operation.path)) return [];
        return [{ ...operation, id: crypto.randomUUID() }];
      }
      if (operation.op === "insert") {
        if (!allowedInserts.has(operation.path)) return [];
        if (!operation.value) return [];
        return [{ ...operation, id: crypto.randomUUID() }];
      }
      return [];
    });
  }, [buildAllowedTargets]);

  const requestBulkRewrite = useCallback(async (
    instruction: string,
    fields: SelectedField[],
    scope: { type: "selection" | "section"; section?: string }
  ) => {
    if (!instruction.trim()) return;
    if (scope.type === "selection" && fields.length === 0) {
      setBulkError("Select some resume text first.");
      return;
    }
    setBulkLoading(true);
    setBulkError(null);
    setBulkOps([]);

    try {
      const response = await fetch("/api/selection-rewrite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          instruction,
          fields,
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
  }, [normalizeBulkOps]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{
        section: SectionKey;
        instruction: string;
      }>).detail;
      if (!detail) return;
      const fields = buildSectionFields(detail.section);
      setBulkFields(fields);
      setBulkTargetLabel(`Section: ${SECTION_LABELS[detail.section]}`);
      setBulkPrompt(detail.instruction);
      setBulkScope({ type: "section", section: detail.section });
      setIsBulkOpen(true);
      requestBulkRewrite(detail.instruction, fields, {
        type: "section",
        section: detail.section,
      });
    };

    window.addEventListener("resume-section-ai", handler as EventListener);
    return () =>
      window.removeEventListener("resume-section-ai", handler as EventListener);
  }, [buildSectionFields, requestBulkRewrite]);

  const getValueAtPath = (data: ResumeData, path: string) => {
    const segments = parseFieldPath(path);
    let cursor: any = data;
    for (const segment of segments) {
      if (cursor == null) return "";
      cursor = cursor[segment as keyof typeof cursor];
    }
    return cursor;
  };

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
        id: crypto.randomUUID(),
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
        description?: string;
        technologies?: string[];
        bullets?: string[];
      }>(value);
      if (!entry) return null;
      return {
        id: crypto.randomUUID(),
        name: entry.name ?? "",
        description: entry.description ?? "",
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
      }>(value);
      if (!entry) return null;
      return {
        id: crypto.randomUUID(),
        degree: entry.degree ?? "",
        institution: entry.institution ?? "",
        location: entry.location ?? "",
        field: entry.field ?? "",
        graduationDate: entry.graduationDate ?? "",
        gpa: entry.gpa ?? "",
      };
    }

    if (itemType === "skill" && path === "skills") {
      const entry = parseJsonValue<{ name?: string; category?: string }>(value);
      if (!entry) return null;
      return {
        id: crypto.randomUUID(),
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
          return next;
        }
      }
      return setResumeValueAtPath(resumeData, op.path, op.value);
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
      fontFamily:
        FONT_FAMILY_MAP[resumeFontPreferences.family] ?? FONT_FAMILY_MAP.serif,
    }),
    [resumeFontPreferences.family]
  );

  const coverLetterTypographyStyle = useMemo<CSSProperties>(
    () => ({
      fontFamily:
        FONT_FAMILY_MAP[coverLetterFontPreferences.family] ??
        FONT_FAMILY_MAP.serif,
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
  const renderSectionHeader = (
    title: string,
    section: SectionKey,
    addButton?: ReactNode
  ) => {
    const sectionAiKey = `section-ai-${section}`;
    const isSectionAiOpen = activeAiTarget === sectionAiKey;
    const isSectionAiLoading =
      bulkLoading &&
      bulkScope.type === "section" &&
      bulkScope.section === section;
    const sectionAiError =
      bulkScope.type === "section" && bulkScope.section === section
        ? bulkError
        : null;

    return (
      <div className="flex items-center justify-between border-b border-gray-300 pb-1 text-gray-900 dark:text-gray-100 dark:border-gray-700">
        <div className="flex min-w-0 items-center gap-1">
          <h2
            className="font-bold uppercase tracking-wide"
            style={resumeFontSizeStyles.sectionTitle}
          >
            {title}
          </h2>
          <InlineAiAssist
            isOpen={isSectionAiOpen}
            onToggle={() => toggleAiTarget(sectionAiKey)}
            onSubmit={(instruction) => {
              window.dispatchEvent(
                new CustomEvent("resume-section-ai", {
                  detail: { section, instruction },
                })
              );
              setActiveAiTarget(null);
            }}
            isLoading={isSectionAiLoading}
            error={sectionAiError}
            placeholder={`Ask AI to improve the ${title.toLowerCase()} section...`}
            triggerClassName="h-5 w-5 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          />
        </div>
        {addButton}
      </div>
    );
  };

  const renderSummaryHeader = () => renderSectionHeader("Summary", "summary");

  const renderSummaryContent = () => (
    renderWithFeedback(
      "metadata.summary",
      <EditableText
        value={metadata.summary}
        onChange={(summary) => updateMetadata({ summary })}
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
      <div className="group space-y-1">
        <div className="flex items-start justify-between gap-2">
          <span
            className="min-w-0 flex-1 font-semibold text-gray-900 dark:text-gray-100"
            style={resumeFontSizeStyles.itemTitle}
          >
            {renderWithFeedback(
              primaryPath,
              <EditableText
                value={entry[primaryField]}
                onChange={(value) =>
                  updateExperienceEntry(entry.id, {
                    [primaryField]: value,
                  } as Partial<ResumeData["experience"][number]>)
                }
                placeholder={primaryFallback}
                fieldPath={primaryPath}
              />
            )}
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
              style={resumeFontSizeStyles.itemMeta}
            >
              {renderWithFeedback(
                startDatePath,
                <EditableText
                  value={entry.startDate}
                  onChange={(value) =>
                    updateExperienceEntry(entry.id, {
                      startDate: value,
                    })
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
                    updateExperienceEntry(entry.id, { endDate: value })
                  }
                  placeholder="Present"
                  fieldPath={endDatePath}
                />
              )}
            </span>
          </div>
        </div>
        <div className="flex items-start justify-between gap-2">
          <p
            className="min-w-0 flex-1 text-gray-700 dark:text-gray-300"
            style={resumeFontSizeStyles.itemDetail}
          >
            {renderWithFeedback(
              secondaryPath,
              <EditableText
                value={entry[secondaryField]}
                onChange={(value) =>
                  updateExperienceEntry(entry.id, {
                    [secondaryField]: value,
                  } as Partial<ResumeData["experience"][number]>)
                }
                placeholder={secondaryFallback}
                fieldPath={secondaryPath}
              />
            )}
          </p>
          <p
            className="shrink-0 text-right text-gray-600 dark:text-gray-400"
            style={resumeFontSizeStyles.itemDetail}
          >
            {renderWithFeedback(
              locationPath,
              <EditableText
                value={entry.location}
                onChange={(value) =>
                  updateExperienceEntry(entry.id, { location: value })
                }
                placeholder="Location"
                fieldPath={locationPath}
              />
            )}
          </p>
        </div>
        {entry.bullets.length > 0 && (
          <ul
            className="mt-1 space-y-1 text-gray-600 dark:text-gray-400"
            style={resumeFontSizeStyles.body}
            role="list"
          >
            {entry.bullets.map((bullet, idx) => {
              const aiKey = `experience-${entry.id}-bullet-${idx}`;
              const isAiOpen = activeAiTarget === aiKey;
              const bulletPath = `experience[${entryIndex}].bullets[${idx}]`;
              const bulletFeedback = pickFeedback(bulletPath);
              const bulletSuggestion = aiSuggestions[aiKey];
              const bulletValue = bulletSuggestion?.replacement ?? bullet;
              return (
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
                  {bulletSuggestion ? (
                    <StaticText
                      value={bulletValue}
                      className="min-w-0 flex-1 break-words self-baseline block"
                      fieldPath={bulletPath}
                    />
                  ) : (
                    <EditableText
                      value={bulletValue}
                      onChange={(value) =>
                        updateExperienceBullet(entry.id, idx, value)
                      }
                      placeholder="Describe your accomplishment..."
                      className="min-w-0 flex-1 break-words self-baseline block"
                      fieldPath={bulletPath}
                    />
                  )}
                  <div className="absolute right-0 top-[0.1em] z-10 flex items-center gap-1 translate-x-full">
                    {bulletFeedback ? (
                      <QualityIndicator
                        feedback={bulletFeedback.feedback}
                        path={bulletFeedback.path}
                        onApplySuggestion={onApplySuggestion}
                      />
                    ) : null}
                    {bulletSuggestion ? (
                      <AiDecisionButtons
                        onAccept={() =>
                          acceptAiSuggestion(aiKey, (value) =>
                            updateExperienceBullet(entry.id, idx, value)
                          )
                        }
                        onReject={() => clearAiSuggestion(aiKey)}
                      />
                    ) : (
                      <InlineAiAssist
                        isOpen={isAiOpen}
                        onToggle={() => toggleAiTarget(aiKey)}
                        onSubmit={(instruction) =>
                          requestAiReplacement(aiKey, bullet, instruction, {
                            section: "experience",
                            field: "bullet",
                            company: entry.company,
                            role: entry.jobTitle,
                            location: entry.location,
                            dates: `${entry.startDate} - ${entry.endDate}`,
                          })
                        }
                        isLoading={Boolean(aiLoading[aiKey])}
                        error={aiErrors[aiKey]}
                        placeholder="Rewrite this achievement..."
                        triggerClassName={aiTriggerClasses(
                          isAiOpen,
                          "group-hover/bullet:opacity-100 group-hover/bullet:pointer-events-auto"
                        )}
                      />
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "h-4 w-4 text-muted-foreground transition hover:text-destructive",
                        isAiOpen || bulletSuggestion
                          ? "opacity-100 pointer-events-auto"
                          : "opacity-0 pointer-events-none group-hover/bullet:opacity-100 group-hover/bullet:pointer-events-auto"
                      )}
                      onClick={() => removeExperienceBullet(entry.id, idx)}
                      aria-label="Remove bullet"
                      disabled={Boolean(bulletSuggestion)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </li>
              );
            })}
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
    const descriptionAiKey = `project-${project.id}-description`;
    const isDescriptionAiOpen = activeAiTarget === descriptionAiKey;
    const namePath = `projects[${projectIndex}].name`;
    const descriptionPath = `projects[${projectIndex}].description`;
    const technologyPaths = project.technologies.map(
      (_, index) => `projects[${projectIndex}].technologies[${index}]`
    );
    const descriptionFeedback = pickFeedback(descriptionPath);
    const descriptionSuggestion = aiSuggestions[descriptionAiKey];
    const descriptionValue =
      descriptionSuggestion?.replacement ?? project.description;

    return (
      <div className="group space-y-1">
        <div className="flex items-start justify-between gap-2">
          <span
            className="min-w-0 flex-1 font-semibold text-gray-900 dark:text-gray-100"
            style={resumeFontSizeStyles.itemTitle}
          >
            {renderWithFeedback(
              namePath,
              <EditableText
                value={project.name}
                onChange={(value) =>
                  updateProjectEntry(project.id, { name: value })
                }
                placeholder="Project Name"
                fieldPath={namePath}
              />
            )}
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
              style={resumeFontSizeStyles.itemMeta}
            >
              {renderWithFeedback(
                technologyPaths,
                <EditableText
                  value={project.technologies.join(", ")}
                  onChange={(value) =>
                    updateProjectEntry(project.id, {
                      technologies: parseCommaList(value),
                    })
                  }
                  placeholder="Technologies"
                  fieldPath={`projects[${projectIndex}].technologies`}
                />
              )}
            </span>
          </div>
        </div>
        <div className="group/ai relative">
          {descriptionSuggestion ? (
            <StaticText
              value={descriptionValue}
              className="text-gray-700 dark:text-gray-300"
              style={resumeFontSizeStyles.body}
              multiline
              fieldPath={descriptionPath}
            />
          ) : (
            <EditableText
              value={descriptionValue}
              onChange={(value) =>
                updateProjectEntry(project.id, { description: value })
              }
              placeholder="Project description"
              className="text-gray-700 dark:text-gray-300"
              style={resumeFontSizeStyles.body}
              multiline
              fieldPath={descriptionPath}
            />
          )}
          <div className="absolute right-0 top-0 z-10 flex items-center gap-1 translate-x-full">
            {descriptionFeedback ? (
              <QualityIndicator
                feedback={descriptionFeedback.feedback}
                path={descriptionFeedback.path}
                onApplySuggestion={onApplySuggestion}
              />
            ) : null}
            {descriptionSuggestion ? (
              <AiDecisionButtons
                onAccept={() =>
                  acceptAiSuggestion(descriptionAiKey, (value) =>
                    updateProjectEntry(project.id, { description: value })
                  )
                }
                onReject={() => clearAiSuggestion(descriptionAiKey)}
              />
            ) : (
              <InlineAiAssist
                isOpen={isDescriptionAiOpen}
                onToggle={() => toggleAiTarget(descriptionAiKey)}
                onSubmit={(instruction) =>
                  requestAiReplacement(
                    descriptionAiKey,
                    project.description,
                    instruction,
                    {
                      section: "projects",
                      field: "description",
                      projectName: project.name,
                      technologies: project.technologies,
                      bullets: project.bullets,
                    }
                  )
                }
                isLoading={Boolean(aiLoading[descriptionAiKey])}
                error={aiErrors[descriptionAiKey]}
                placeholder="Rewrite this project summary..."
                triggerClassName={aiTriggerClasses(
                  isDescriptionAiOpen,
                  "group-hover/ai:opacity-100 group-hover/ai:pointer-events-auto"
                )}
              />
            )}
          </div>
        </div>
        {project.bullets.length > 0 && (
          <ul
            className="mt-1 space-y-1 text-gray-600 dark:text-gray-400"
            style={resumeFontSizeStyles.body}
            role="list"
          >
            {project.bullets.map((bullet, idx) => {
              const aiKey = `project-${project.id}-bullet-${idx}`;
              const isAiOpen = activeAiTarget === aiKey;
              const bulletPath = `projects[${projectIndex}].bullets[${idx}]`;
              const bulletFeedback = pickFeedback(bulletPath);
              const bulletSuggestion = aiSuggestions[aiKey];
              const bulletValue = bulletSuggestion?.replacement ?? bullet;
              return (
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
                  {bulletSuggestion ? (
                    <StaticText
                      value={bulletValue}
                      className="min-w-0 flex-1 break-words self-baseline block"
                      fieldPath={bulletPath}
                    />
                  ) : (
                    <EditableText
                      value={bulletValue}
                      onChange={(value) =>
                        updateProjectBullet(project.id, idx, value)
                      }
                      placeholder="Project impact..."
                      className="min-w-0 flex-1 break-words self-baseline block"
                      fieldPath={bulletPath}
                    />
                  )}
                  <div className="absolute right-0 top-[0.1em] z-10 flex items-center gap-1 translate-x-full">
                    {bulletFeedback ? (
                      <QualityIndicator
                        feedback={bulletFeedback.feedback}
                        path={bulletFeedback.path}
                        onApplySuggestion={onApplySuggestion}
                      />
                    ) : null}
                    {bulletSuggestion ? (
                      <AiDecisionButtons
                        onAccept={() =>
                          acceptAiSuggestion(aiKey, (value) =>
                            updateProjectBullet(project.id, idx, value)
                          )
                        }
                        onReject={() => clearAiSuggestion(aiKey)}
                      />
                    ) : (
                      <InlineAiAssist
                        isOpen={isAiOpen}
                        onToggle={() => toggleAiTarget(aiKey)}
                        onSubmit={(instruction) =>
                          requestAiReplacement(aiKey, bullet, instruction, {
                            section: "projects",
                            field: "bullet",
                            projectName: project.name,
                            description: project.description,
                            technologies: project.technologies,
                          })
                        }
                        isLoading={Boolean(aiLoading[aiKey])}
                        error={aiErrors[aiKey]}
                        placeholder="Rewrite this bullet..."
                        triggerClassName={aiTriggerClasses(
                          isAiOpen,
                          "group-hover/bullet:opacity-100 group-hover/bullet:pointer-events-auto"
                        )}
                      />
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "h-4 w-4 text-muted-foreground transition hover:text-destructive",
                        isAiOpen || bulletSuggestion
                          ? "opacity-100 pointer-events-auto"
                          : "opacity-0 pointer-events-none group-hover/bullet:opacity-100 group-hover/bullet:pointer-events-auto"
                      )}
                      onClick={() => removeProjectBullet(project.id, idx)}
                      aria-label="Remove bullet"
                      disabled={Boolean(bulletSuggestion)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </li>
              );
            })}
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
    const locationPath = `education[${entryIndex}].location`;

    return (
      <div className="group space-y-1">
        <div className="flex items-start justify-between gap-2">
          <p
            className="font-semibold text-gray-900 dark:text-gray-100"
            style={resumeFontSizeStyles.itemTitle}
          >
            {renderWithFeedback(
              primaryPath,
              <EditableText
                value={entry[primaryField] ?? ""}
                onChange={(value) =>
                  updateEducationEntry(entry.id, {
                    [primaryField]: value,
                  } as Partial<ResumeData["education"][number]>)
                }
                placeholder={primaryFallback}
                fieldPath={primaryPath}
              />
            )}
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
              style={resumeFontSizeStyles.itemMeta}
            >
              {renderWithFeedback(
                graduationPath,
                <EditableText
                  value={entry.graduationDate ?? ""}
                  onChange={(value) =>
                    updateEducationEntry(entry.id, { graduationDate: value })
                  }
                  placeholder="Graduation"
                  fieldPath={graduationPath}
                />
              )}
            </span>
          </div>
        </div>
        <div className="flex items-start justify-between gap-2">
          <p
            className="text-gray-700 dark:text-gray-300"
            style={resumeFontSizeStyles.itemDetail}
          >
            {renderWithFeedback(
              secondaryPath,
              <EditableText
                value={entry[secondaryField] ?? ""}
                onChange={(value) =>
                  updateEducationEntry(entry.id, {
                    [secondaryField]: value,
                  } as Partial<ResumeData["education"][number]>)
                }
                placeholder={secondaryFallback}
                fieldPath={secondaryPath}
              />
            )}
            {entry.gpa && (
              <>
                <span className="text-gray-400"> | </span>
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
                        updateEducationEntry(entry.id, { gpa: value })
                      }
                      placeholder="GPA"
                      fieldPath={gpaPath}
                    />
                  )}
                </span>
              </>
            )}
          </p>
          <p
            className="text-right text-gray-600 dark:text-gray-400"
            style={resumeFontSizeStyles.itemDetail}
          >
            {renderWithFeedback(
              locationPath,
              <EditableText
                value={entry.location ?? ""}
                onChange={(value) =>
                  updateEducationEntry(entry.id, { location: value })
                }
                placeholder="Location"
                fieldPath={locationPath}
              />
            )}
          </p>
        </div>
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
          onChange={(value) => updateSkill(skill.id, { name: value })}
          placeholder="Skill"
          fieldPath={skillPath ?? undefined}
        />
      );

      return (
        <span className="inline-flex items-center gap-1 group/skill">
          {skillPath ? renderWithFeedback(skillPath, content) : content}
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
          onChange={(value) => updateSkillCategory(category, value)}
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
              style={resumeFontSizeStyles.body}
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
      style={resumeFontSizeStyles.body}
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
            {renderInlineAlignment("Name", headerAlignment.name, (value) =>
              updateHeaderAlignment("name", value)
            )}
            <h1
              className="font-bold text-gray-900 dark:text-gray-100"
              style={resumeFontSizeStyles.name}
            >
              {renderWithFeedback(
                "metadata.fullName",
                <EditableText
                  value={metadata.fullName}
                  onChange={(fullName) => updateMetadata({ fullName })}
                  placeholder="Your Name"
                  fieldPath="metadata.fullName"
                />
              )}
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
              style={resumeFontSizeStyles.subtitle}
            >
              {renderWithFeedback(
                "metadata.subtitle",
                <EditableText
                  value={metadata.subtitle}
                  onChange={(subtitle) => updateMetadata({ subtitle })}
                  placeholder="Professional Title"
                  fieldPath="metadata.subtitle"
                />
              )}
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
                  const onChange = (nextValue: string) =>
                    updateContactInfo({ [key]: nextValue });
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
                    const input = (
                      <EditableText
                        value={item.value}
                        onChange={item.onChange}
                        placeholder={item.placeholder}
                        fieldPath={feedbackPath}
                      />
                    );
                      const node = item.link ? (
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
              placeholder={todayFormatted || "Month Day, Year"}
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
    todayFormatted,
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

  return (
    <div className="relative flex h-full flex-col">
      {selectionState && selectionAnchor && !isBulkOpen && (
        <div
          className="fixed z-40"
          style={{ top: selectionAnchor.top, left: selectionAnchor.left }}
        >
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="h-8 w-8 shadow-md"
            onClick={() => {
              setBulkFields(selectionState.fields);
              setBulkTargetLabel(`Selection (${selectionState.fields.length})`);
              setBulkPrompt("");
              setBulkOps([]);
              setBulkError(null);
              setBulkScope({ type: "selection" });
              setIsBulkOpen(true);
            }}
            aria-label="Rewrite selection with AI"
          >
            <Sparkles className="h-4 w-4" />
          </Button>
        </div>
      )}
      {isBulkOpen && (
        <div
          className="absolute right-4 z-40 w-[380px] rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-xl"
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
                  placeholder="Tell AI how to improve the selection..."
                  className="h-8 text-xs"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      requestBulkRewrite(
                        bulkPrompt,
                        bulkFields,
                        bulkScope
                      );
                    }
                  }}
                />
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
                        bulkScope
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
        <div className="absolute right-4 top-[60px] z-40 w-[360px] rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-xl">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium">LLM Raw Output</p>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => setIsDebugOpen(false)}
            >
              Close
            </Button>
          </div>
          <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap text-[10px] text-muted-foreground">
            {rawDebugJson || "No analysis yet."}
          </pre>
        </div>
      )}
      <Tabs defaultValue="resume" className="flex h-full flex-col">
        <div className="flex h-[52px] items-center border-b border-border px-4">
          <TabsList className="h-12 flex-1 justify-start gap-4 bg-transparent p-0">
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
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => setIsDebugOpen((current) => !current)}
              disabled={!analysis}
            >
              {isDebugOpen ? "Hide Debug" : "Debug"}
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="flex justify-center p-8">
            <TabsContent
              value="resume"
              className="mt-0 w-full"
              style={{ maxWidth: paperMaxWidth }}
            >
              <div
                ref={setResumeContainerRef}
                className="resume-pages flex flex-col gap-8"
                onMouseUp={collectSelectedFields}
                onKeyUp={collectSelectedFields}
              >
                {resumePageIndices.map((pageIndex) => (
                  <div
                    key={pageIndex}
                  className="document-paper rounded-sm overflow-visible"
                  style={{
                      ...paperStyle,
                      ...getPageHeightStyle(resumePagination.pageDimensions),
                      ...resumeTypographyStyle,
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
                {coverLetterPageIndices.map((pageIndex) => (
                  <div
                    key={pageIndex}
                  className="document-paper rounded-sm overflow-visible"
                  style={{
                      ...paperStyle,
                      ...getPageHeightStyle(coverLetterPagination.pageDimensions),
                      ...coverLetterTypographyStyle,
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
