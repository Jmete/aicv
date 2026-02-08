"use client";

import type {
  ApplicationFormData,
  ExtractedRequirement,
} from "@/components/layout/app-layout";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";

interface JobInputPanelProps {
  formData: ApplicationFormData;
  onChange: (data: ApplicationFormData) => void;
  onExtractJobDescription: () => void;
  isExtractingJobDescription: boolean;
  extractError: string | null;
  onExtractRequirements: () => void;
  isExtractingRequirements: boolean;
  requirements: ExtractedRequirement[];
  requirementsError: string | null;
  isDiffViewOpen: boolean;
  onToggleDiffView: () => void;
  onResetResume: () => void;
}

export function JobInputPanel({
  formData,
  onChange,
  onExtractJobDescription,
  isExtractingJobDescription,
  extractError,
  onExtractRequirements,
  isExtractingRequirements,
  requirements,
  requirementsError,
  isDiffViewOpen,
  onToggleDiffView,
  onResetResume,
}: JobInputPanelProps) {
  const canExtract = Boolean(formData.jobUrl.trim());
  const canExtractRequirements = Boolean(formData.jobDescription.trim());

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-4">
        <h2 className="text-sm font-medium text-foreground">Job URL Extractor</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Paste a job URL, extract readable text, and review changes in diff view.
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-4 p-4">
          <div className="space-y-2">
            <label
              htmlFor="jobUrl"
              className="text-sm font-medium text-muted-foreground"
            >
              Job URL
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
                onChange={(event) =>
                  onChange({ ...formData, jobUrl: event.target.value })
                }
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-10 shrink-0 px-3"
                onClick={onExtractJobDescription}
                disabled={!canExtract || isExtractingJobDescription}
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
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="jobDescription"
                className="text-sm font-medium text-muted-foreground"
              >
                Extracted Text
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 shrink-0 px-3 text-xs"
                onClick={onExtractRequirements}
                disabled={!canExtractRequirements || isExtractingRequirements}
              >
                {isExtractingRequirements ? (
                  <>
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    Extracting...
                  </>
                ) : (
                  "Extract Requirements"
                )}
              </Button>
            </div>
            <Textarea
              id="jobDescription"
              placeholder="Extracted job text appears here..."
              className="min-h-[280px] resize-none"
              value={formData.jobDescription}
              onChange={(event) =>
                onChange({ ...formData, jobDescription: event.target.value })
              }
            />
          </div>

          <div className="rounded-md border border-border/70 bg-card/30 p-3">
            <p className="text-xs font-semibold tracking-wide text-foreground">
              Prioritized Requirements
            </p>
            {requirements.length > 0 ? (
              <ol className="mt-2 space-y-1.5">
                {requirements.map((item, index) => (
                  <li
                    key={`${item.requirement}-${index}`}
                    className="flex items-start justify-between gap-3 rounded-sm border border-border/40 bg-background/80 px-2 py-1.5 text-[11px]"
                  >
                    <span className="min-w-0 text-foreground">
                      {index + 1}. {item.requirement}
                    </span>
                    <span className="shrink-0 rounded-sm border border-border/50 bg-muted/40 px-1.5 py-0.5 font-medium text-muted-foreground">
                      {item.weight}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Click &quot;Extract Requirements&quot; to generate a weighted list.
              </p>
            )}
          </div>

          {extractError ? (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-[11px] text-destructive">
              {extractError}
            </div>
          ) : null}
          {requirementsError ? (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-[11px] text-destructive">
              {requirementsError}
            </div>
          ) : null}
        </div>
      </ScrollArea>

      <div className="border-t border-border p-4">
        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={onToggleDiffView}
          >
            {isDiffViewOpen ? "Close Diff" : "Open Diff"}
          </Button>
          <Button variant="ghost" className="flex-1" onClick={onResetResume}>
            Reset Resume
          </Button>
        </div>
      </div>
    </div>
  );
}
