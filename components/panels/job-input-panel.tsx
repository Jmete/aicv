"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import type {
  AnalyzeSuggestion,
  ApplicationFormData,
} from "@/components/layout/app-layout";

interface JobInputPanelProps {
  formData: ApplicationFormData;
  onChange: (data: ApplicationFormData) => void;
  onExtractJobDescription: () => void;
  onAnalyze: () => void;
  onSave: () => void;
  isExtractingJobDescription: boolean;
  isAnalyzing: boolean;
  extractError: string | null;
  analyzeError: string | null;
  analyzeMeta: {
    jobDescriptionSource: "manual" | "url" | "url+manual";
    scrapeWarning: string | null;
    estimatedResumePages: number;
    estimatedCoverLetterPages: number;
  } | null;
  actualResumePages: number;
  actualCoverLetterPages: number;
  isPrintPreviewMode: boolean;
  analyzeSuggestions: AnalyzeSuggestion[];
  onAcceptAnalyzeSuggestion: (suggestionId: string) => void;
  onRejectAnalyzeSuggestion: (suggestionId: string) => void;
  onResetAnalyzeSuggestion: (suggestionId: string) => void;
  onApplyAllAnalyzeSuggestions: () => void;
  onDiscardAnalyzeSuggestions: () => void;
  onResetResume: () => void;
}

const SUGGESTION_SECTION_ORDER = [
  "summary",
  "experience",
  "projects",
  "skills",
  "cover-letter",
  "education",
  "other",
] as const;

const SUGGESTION_SECTION_LABELS: Record<
  (typeof SUGGESTION_SECTION_ORDER)[number],
  string
> = {
  summary: "Summary & Header",
  experience: "Experience",
  projects: "Projects",
  skills: "Skills",
  "cover-letter": "Cover Letter",
  education: "Education",
  other: "Other",
};

const getSuggestionSection = (path: string) => {
  if (path.startsWith("metadata.")) return "summary";
  if (path.startsWith("experience[")) return "experience";
  if (path.startsWith("projects[")) return "projects";
  if (path.startsWith("skills")) return "skills";
  if (path.startsWith("coverLetter")) return "cover-letter";
  if (path.startsWith("education[")) return "education";
  return "other";
};

export function JobInputPanel({
  formData,
  onChange,
  onExtractJobDescription,
  onAnalyze,
  onSave,
  isExtractingJobDescription,
  isAnalyzing,
  extractError,
  analyzeError,
  analyzeMeta,
  actualResumePages,
  actualCoverLetterPages,
  isPrintPreviewMode,
  analyzeSuggestions,
  onAcceptAnalyzeSuggestion,
  onRejectAnalyzeSuggestion,
  onResetAnalyzeSuggestion,
  onApplyAllAnalyzeSuggestions,
  onDiscardAnalyzeSuggestions,
  onResetResume,
}: JobInputPanelProps) {
  const handleTextChange = (
    field:
      | "companyName"
      | "jobTitle"
      | "jobUrl"
      | "jobDescription",
    value: string
  ) => {
    onChange({ ...formData, [field]: value });
  };

  const handleMaxResumePagesChange = (value: number) => {
    onChange({ ...formData, maxResumePages: value });
  };

  const canExtract = Boolean(formData.jobUrl.trim());
  const canSave = Boolean(
    formData.companyName.trim() &&
      formData.jobTitle.trim() &&
      (formData.jobDescription.trim() || formData.jobUrl.trim())
  );
  const canAnalyze = Boolean(
    formData.jobDescription.trim() || formData.jobUrl.trim()
  );
  const pendingSuggestions = analyzeSuggestions.filter(
    (suggestion) => suggestion.status === "pending"
  );
  const [collapsedSections, setCollapsedSections] = useState<
    Record<string, boolean>
  >({});
  const groupedSuggestions = useMemo(() => {
    const buckets: Record<string, AnalyzeSuggestion[]> = {};

    for (const suggestion of analyzeSuggestions) {
      const section = getSuggestionSection(suggestion.path);
      if (!buckets[section]) {
        buckets[section] = [];
      }
      buckets[section].push(suggestion);
    }

    return SUGGESTION_SECTION_ORDER.flatMap((section) => {
      const suggestions = buckets[section] ?? [];
      if (suggestions.length === 0) return [];
      const pending = suggestions.filter((s) => s.status === "pending").length;
      const accepted = suggestions.filter((s) => s.status === "accepted").length;
      const rejected = suggestions.filter((s) => s.status === "rejected").length;
      return [
        {
          key: section,
          label: SUGGESTION_SECTION_LABELS[section],
          suggestions,
          pending,
          accepted,
          rejected,
        },
      ];
    });
  }, [analyzeSuggestions]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-4">
        <h2 className="text-sm font-medium text-foreground">Job Details</h2>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-4 p-4">
          <div className="space-y-2">
            <label
              htmlFor="jobUrl"
              className="text-sm font-medium text-muted-foreground"
            >
              Job URL (optional)
            </label>
            <div className="flex items-center gap-2">
              <Input
                id="jobUrl"
                type="text"
                inputMode="url"
                autoComplete="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="https://..."
                value={formData.jobUrl}
                onChange={(e) => handleTextChange("jobUrl", e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-10 shrink-0 px-3"
                onClick={onExtractJobDescription}
                disabled={!canExtract || isExtractingJobDescription || isAnalyzing}
              >
                {isExtractingJobDescription ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Extracting...
                  </>
                ) : (
                  "Extract"
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="companyName"
              className="text-sm font-medium text-muted-foreground"
            >
              Company Name
            </label>
            <Input
              id="companyName"
              placeholder="Acme Inc."
              value={formData.companyName}
              onChange={(e) => handleTextChange("companyName", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="jobTitle"
              className="text-sm font-medium text-muted-foreground"
            >
              Job Title
            </label>
            <Input
              id="jobTitle"
              placeholder="Software Engineer"
              value={formData.jobTitle}
              onChange={(e) => handleTextChange("jobTitle", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="jobDescription"
              className="text-sm font-medium text-muted-foreground"
            >
              Job Description
            </label>
            <Textarea
              id="jobDescription"
              placeholder="Paste the job description here..."
              className="min-h-[200px] resize-none"
              value={formData.jobDescription}
              onChange={(e) =>
                handleTextChange("jobDescription", e.target.value)
              }
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="maxResumePages"
              className="text-sm font-medium text-muted-foreground"
            >
              Max Resume Pages
            </label>
            <Input
              id="maxResumePages"
              type="number"
              min={1}
              max={4}
              value={formData.maxResumePages}
              onChange={(event) => {
                const parsed = Number.parseInt(event.target.value, 10);
                handleMaxResumePagesChange(
                  Number.isFinite(parsed) ? Math.min(4, Math.max(1, parsed)) : 1
                );
              }}
            />
            <p className="text-[11px] text-muted-foreground">
              {isPrintPreviewMode
                ? `Print-preview pages: resume ${actualResumePages}/${formData.maxResumePages}, cover letter ${actualCoverLetterPages}/1`
                : "Print preview is off. Enable Print Preview to see export-accurate page counts."}
            </p>
          </div>

          <div className="rounded-md border border-border bg-muted/20 p-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-foreground">
                  Allow deletion suggestions
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Off by default. Deletions still require manual approval.
                </p>
              </div>
              <Switch
                checked={formData.allowDeletions}
                onCheckedChange={(checked) =>
                  onChange({ ...formData, allowDeletions: checked })
                }
                aria-label="Allow deletion suggestions"
              />
            </div>
          </div>

          {analyzeMeta && (
            <div className="rounded-md border border-border bg-muted/30 p-2 text-[11px] text-muted-foreground">
              <p>
                Last source: {analyzeMeta.jobDescriptionSource} | Estimated pages: resume {analyzeMeta.estimatedResumePages}/{formData.maxResumePages}, cover {analyzeMeta.estimatedCoverLetterPages}/1
              </p>
              {analyzeMeta.scrapeWarning && (
                <p className="mt-1 text-destructive">{analyzeMeta.scrapeWarning}</p>
              )}
            </div>
          )}

          {extractError && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-[11px] text-destructive">
              {extractError}
            </div>
          )}

          {analyzeError && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-[11px] text-destructive">
              {analyzeError}
            </div>
          )}

          {analyzeSuggestions.length > 0 && (
            <div className="space-y-2 rounded-md border border-border bg-card p-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-foreground">
                  AI Suggestions ({pendingSuggestions.length} pending)
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={onApplyAllAnalyzeSuggestions}
                  >
                    Apply Non-Delete
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={onDiscardAnalyzeSuggestions}
                  >
                    Clear
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                {groupedSuggestions.map((group) => {
                  const isCollapsed = collapsedSections[group.key] ?? false;
                  return (
                    <div
                      key={group.key}
                      className="rounded border border-border/70 bg-background"
                    >
                      <button
                        type="button"
                        className="flex w-full items-center justify-between px-2 py-1.5 text-left"
                        onClick={() =>
                          setCollapsedSections((current) => ({
                            ...current,
                            [group.key]: !isCollapsed,
                          }))
                        }
                      >
                        <div>
                          <p className="text-[11px] font-medium text-foreground">
                            {group.label}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {group.pending} pending • {group.accepted} accepted • {group.rejected} rejected
                          </p>
                        </div>
                        {isCollapsed ? (
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </button>
                      {!isCollapsed && (
                        <div className="space-y-2 border-t border-border/60 p-2">
                          {group.suggestions.map((suggestion) => (
                            <div
                              key={suggestion.id}
                              className="rounded border border-border/70 bg-card p-2"
                            >
                              <p className="text-[11px] font-medium text-foreground">
                                {suggestion.label}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                {suggestion.op.toUpperCase()} • {suggestion.path}
                              </p>
                              {suggestion.beforeText ? (
                                <p className="mt-1 text-[10px] text-muted-foreground line-clamp-2">
                                  From: {suggestion.beforeText}
                                </p>
                              ) : null}
                              {suggestion.afterText ? (
                                <p className="mt-1 text-[10px] text-foreground line-clamp-2">
                                  To: {suggestion.afterText}
                                </p>
                              ) : null}
                              {typeof suggestion.lineDelta === "number" ||
                              typeof suggestion.confidence === "number" ? (
                                <p className="mt-1 text-[10px] text-muted-foreground">
                                  {typeof suggestion.lineDelta === "number"
                                    ? `Line delta: ${suggestion.lineDelta >= 0 ? "+" : ""}${suggestion.lineDelta}`
                                    : ""}
                                  {typeof suggestion.lineDelta === "number" &&
                                  typeof suggestion.confidence === "number"
                                    ? " • "
                                    : ""}
                                  {typeof suggestion.confidence === "number"
                                    ? `Confidence: ${Math.round(
                                        suggestion.confidence * 100
                                      )}%`
                                    : ""}
                                </p>
                              ) : null}
                              {suggestion.keywordsCovered &&
                              suggestion.keywordsCovered.length > 0 ? (
                                <p className="mt-1 text-[10px] text-muted-foreground line-clamp-1">
                                  Keywords: {suggestion.keywordsCovered.join(", ")}
                                </p>
                              ) : null}
                              {suggestion.manualApprovalRequired ? (
                                <p className="mt-1 text-[10px] text-destructive">
                                  Manual approval required.
                                </p>
                              ) : null}
                              <div className="mt-2 flex items-center justify-between">
                                <span className="text-[10px] text-muted-foreground capitalize">
                                  {suggestion.status}
                                </span>
                                <div className="flex items-center gap-1">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-[10px]"
                                    onClick={() =>
                                      onResetAnalyzeSuggestion(suggestion.id)
                                    }
                                    disabled={suggestion.status === "pending"}
                                  >
                                    Reset
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-[10px]"
                                    onClick={() =>
                                      onRejectAnalyzeSuggestion(suggestion.id)
                                    }
                                    disabled={suggestion.status !== "pending"}
                                  >
                                    Reject
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    className="h-6 px-2 text-[10px]"
                                    onClick={() =>
                                      onAcceptAnalyzeSuggestion(suggestion.id)
                                    }
                                    disabled={
                                      suggestion.status !== "pending" ||
                                      (suggestion.op === "delete" &&
                                        !formData.allowDeletions)
                                    }
                                  >
                                    Accept
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="border-t border-border p-4">
        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={onAnalyze}
            disabled={!canAnalyze || isAnalyzing || isExtractingJobDescription}
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              "Analyze"
            )}
          </Button>
          <Button
            className="flex-1"
            onClick={onSave}
            disabled={!canSave || isAnalyzing}
          >
            Save
          </Button>
        </div>
        <Button
          variant="ghost"
          className="mt-2 w-full"
          onClick={onResetResume}
          disabled={isAnalyzing}
        >
          Reset Resume
        </Button>
      </div>
    </div>
  );
}
