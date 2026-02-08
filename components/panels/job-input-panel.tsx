"use client";

import { useMemo, useState } from "react";
import type {
  ApplicationFormData,
  ExtractedAtomicUnit,
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
  atomicUnits: ExtractedAtomicUnit[];
  requirementsError: string | null;
  requirementsDebugPayload: unknown | null;
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
  atomicUnits,
  requirementsError,
  requirementsDebugPayload,
  isDiffViewOpen,
  onToggleDiffView,
  onResetResume,
}: JobInputPanelProps) {
  const canExtract = Boolean(formData.jobUrl.trim());
  const canExtractRequirements = Boolean(formData.jobDescription.trim());
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const debugJson = useMemo(
    () =>
      requirementsDebugPayload
        ? JSON.stringify(requirementsDebugPayload, null, 2)
        : "",
    [requirementsDebugPayload]
  );

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
            {atomicUnits.length > 0 ? (
              <div className="mt-2 grid grid-cols-1 gap-2">
                {atomicUnits.map((item, index) => (
                  <article
                    key={`${item.id}-${index}`}
                    className="rounded-md border border-border/50 bg-background/90 p-2"
                  >
                    <p className="truncate text-[11px] font-semibold text-foreground">
                      {item.canonical}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span className="rounded-sm border border-border/50 bg-muted/40 px-1.5 py-0.5">
                        type: {item.type}
                      </span>
                      <span className="rounded-sm border border-border/50 bg-muted/40 px-1.5 py-0.5">
                        weight: {item.weight}
                      </span>
                      <span className="rounded-sm border border-border/50 bg-muted/40 px-1.5 py-0.5">
                        must_have: {item.mustHave ? "true" : "false"}
                      </span>
                      <span className="rounded-sm border border-border/50 bg-muted/40 px-1.5 py-0.5">
                        coverage: {item.coverageStatus}
                      </span>
                      <span className="rounded-sm border border-border/50 bg-muted/40 px-1.5 py-0.5">
                        feasibility: {item.feasibility}
                      </span>
                      <span className="rounded-sm border border-border/50 bg-muted/40 px-1.5 py-0.5">
                        matches: {item.matchedResumeRefs.length}
                      </span>
                    </div>
                    {item.gaps.length > 0 ? (
                      <p className="mt-1 truncate text-[10px] text-muted-foreground">
                        gap: {item.gaps[0]}
                      </p>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Click &quot;Extract Requirements&quot; to generate a weighted list.
              </p>
            )}
            <div className="mt-3 border-t border-border/60 pt-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Debug JSON
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => setIsDebugOpen((current) => !current)}
                  disabled={!requirementsDebugPayload}
                >
                  {isDebugOpen ? "Hide" : "Show"}
                </Button>
              </div>
              {requirementsDebugPayload ? (
                isDebugOpen ? (
                  <pre className="mt-2 max-h-56 overflow-auto rounded-sm border border-border/50 bg-background/90 p-2 font-mono text-[10px] leading-relaxed text-foreground">
                    {debugJson}
                  </pre>
                ) : null
              ) : (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Run extraction to inspect API JSON.
                </p>
              )}
            </div>
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
