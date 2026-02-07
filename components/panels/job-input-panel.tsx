"use client";

import type { ApplicationFormData } from "@/components/layout/app-layout";
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
  isDiffViewOpen,
  onToggleDiffView,
  onResetResume,
}: JobInputPanelProps) {
  const canExtract = Boolean(formData.jobUrl.trim());

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
            <label
              htmlFor="jobDescription"
              className="text-sm font-medium text-muted-foreground"
            >
              Extracted Text
            </label>
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

          {extractError ? (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-[11px] text-destructive">
              {extractError}
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
