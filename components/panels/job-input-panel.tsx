"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ApplicationFormData,
  ExtractedRequirement,
  RequirementResolutionState,
  RoleFamily,
} from "@/components/layout/app-layout";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface JobInputPanelProps {
  profileOptions: { id: string; name: string }[];
  selectedProfileId: string;
  onSelectProfile: (profileId: string) => void;
  isSelectingProfile: boolean;
  formData: ApplicationFormData;
  onChange: (data: ApplicationFormData) => void;
  onExtractJobDescription: () => void;
  isExtractingJobDescription: boolean;
  extractError: string | null;
  onExtractRequirements: () => void;
  isExtractingRequirements: boolean;
  requirements: ExtractedRequirement[];
  extractedRoleTitle: string;
  extractedRoleFamily: RoleFamily | null;
  requirementsError: string | null;
  requirementsDebugPayload: unknown | null;
  onAiEdit: () => void;
  isAiEditing: boolean;
  aiEditError: string | null;
  aiEditProgress: {
    completed: number;
    total: number;
  };
  requirementResolutionById: Record<string, RequirementResolutionState>;
  requirementCoverage: {
    directlyMentioned: number;
    total: number;
  };
  onRequirementHover: (path: string | null) => void;
  isDiffViewOpen: boolean;
  onToggleDiffView: () => void;
  onResetResume: () => void;
}

const ROLE_FAMILY_LABELS: Record<RoleFamily, string> = {
  data_science: "Data Science",
  mlops: "MLOps",
  data_engineering: "Data Engineering",
  product: "Product",
  audit: "Audit",
  consulting: "Consulting",
  governance: "Governance",
  other: "Other",
};

export function JobInputPanel({
  profileOptions,
  selectedProfileId,
  onSelectProfile,
  isSelectingProfile,
  formData,
  onChange,
  onExtractJobDescription,
  isExtractingJobDescription,
  extractError,
  onExtractRequirements,
  isExtractingRequirements,
  requirements,
  extractedRoleTitle,
  extractedRoleFamily,
  requirementsError,
  requirementsDebugPayload,
  onAiEdit,
  isAiEditing,
  aiEditError,
  aiEditProgress,
  requirementResolutionById,
  requirementCoverage,
  onRequirementHover,
  isDiffViewOpen,
  onToggleDiffView,
  onResetResume,
}: JobInputPanelProps) {
  const canExtract = Boolean(formData.jobUrl.trim());
  const canExtractRequirements = Boolean(formData.jobDescription.trim());
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const [didCopyDebugJson, setDidCopyDebugJson] = useState(false);

  const debugJson = useMemo(
    () =>
      requirementsDebugPayload
        ? JSON.stringify(requirementsDebugPayload, null, 2)
        : "",
    [requirementsDebugPayload]
  );

  const requirementStats = useMemo(() => {
    const total = requirements.length;
    const mustHave = requirements.filter((item) => item.mustHave).length;
    const niceToHave = total - mustHave;
    return { total, mustHave, niceToHave };
  }, [requirements]);
  const canAiEdit = requirements.length > 0;
  const aiEditProgressPercent =
    aiEditProgress.total > 0
      ? Math.max(
          0,
          Math.min(100, Math.round((aiEditProgress.completed / aiEditProgress.total) * 100))
        )
      : 0;
  const getMentionDotClass = (
    mentioned: RequirementResolutionState["mentioned"] | null
  ) => {
    if (mentioned === "yes") return "bg-emerald-500";
    if (mentioned === "implied") return "bg-amber-500";
    if (mentioned === "none") return "bg-rose-500";
    return "bg-muted-foreground/40";
  };

  const copyDebugJson = useCallback(async () => {
    if (!debugJson) return;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(debugJson);
      } else if (typeof document !== "undefined") {
        const textarea = document.createElement("textarea");
        textarea.value = debugJson;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "absolute";
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
  }, [debugJson]);

  useEffect(() => {
    if (!didCopyDebugJson) return;
    const timeout = window.setTimeout(() => {
      setDidCopyDebugJson(false);
    }, 1200);
    return () => window.clearTimeout(timeout);
  }, [didCopyDebugJson]);

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-medium text-foreground">Job URL Extractor</h2>
          </div>
          <div className="w-36 shrink-0">
            <Select
              value={selectedProfileId}
              onValueChange={onSelectProfile}
              disabled={isSelectingProfile}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Base profile" />
              </SelectTrigger>
              <SelectContent>
                {profileOptions.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {profile.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex min-w-0 flex-col gap-4 p-4">
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

          <div className="min-w-0 overflow-hidden rounded-md border border-border/70 bg-card/30 p-3">
            <p className="text-xs font-semibold tracking-wide text-foreground">
              Prioritized Requirements
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                mentioned
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                implied
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-rose-500" />
                none
              </span>
            </div>

            {extractedRoleTitle || extractedRoleFamily ? (
              <div className="mt-2 rounded-md border border-border/50 bg-background/90 p-2 text-[10px]">
                {extractedRoleTitle ? (
                  <p className="truncate text-[11px] font-semibold text-foreground">
                    {extractedRoleTitle}
                  </p>
                ) : null}
                {extractedRoleFamily ? (
                  <p className="mt-0.5 text-muted-foreground">
                    family: {ROLE_FAMILY_LABELS[extractedRoleFamily]}
                  </p>
                ) : null}
              </div>
            ) : null}

            {requirements.length > 0 ? (
              <>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div className="rounded-md border border-border/50 bg-background/90 p-2">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Total
                    </p>
                    <p className="text-sm font-semibold text-foreground">
                      {requirementStats.total}
                    </p>
                  </div>
                  <div className="rounded-md border border-border/50 bg-background/90 p-2">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Must-Have
                    </p>
                    <p className="text-sm font-semibold text-foreground">
                      {requirementStats.mustHave}
                    </p>
                  </div>
                  <div className="rounded-md border border-border/50 bg-background/90 p-2">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Nice-To-Have
                    </p>
                    <p className="text-sm font-semibold text-foreground">
                      {requirementStats.niceToHave}
                    </p>
                  </div>
                  <div className="rounded-md border border-border/50 bg-background/90 p-2">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Coverage
                    </p>
                    <p className="text-sm font-semibold text-foreground">
                      {requirementCoverage.directlyMentioned}/{requirementCoverage.total}
                    </p>
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-1 gap-2">
                  {requirements.map((item, index) => {
                    const resolution = requirementResolutionById[item.id] ?? null;
                    const resolvedPath = resolution?.resolvedPath ?? null;
                    const mentionState = resolution?.mentioned ?? null;
                    return (
                    <article
                      key={`${item.id}-${index}`}
                      className="relative rounded-md border border-border/50 bg-background/90 p-2"
                      onMouseEnter={() => onRequirementHover(resolvedPath)}
                      onMouseLeave={() => onRequirementHover(null)}
                    >
                      <span
                        className={`absolute left-1.5 top-1.5 h-2.5 w-2.5 rounded-full ${getMentionDotClass(
                          mentionState
                        )}`}
                        title={
                          mentionState
                            ? `Mentioned: ${mentionState}`
                            : "Not evaluated yet"
                        }
                      />
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-[11px] font-semibold text-foreground">
                          {item.canonical}
                        </p>
                        <span className="rounded-sm border border-border/50 bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {item.mustHave ? "must-have" : "nice-to-have"}
                        </span>
                      </div>
                      {resolution ? (
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          mentioned: {resolution.mentioned}
                        </p>
                      ) : null}

                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span className="rounded-sm border border-border/50 bg-muted/40 px-1.5 py-0.5">
                          type: {item.type}
                        </span>
                        <span className="rounded-sm border border-border/50 bg-muted/40 px-1.5 py-0.5">
                          weight: {item.weight}
                        </span>
                      </div>

                      {item.aliases.length > 0 ? (
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          aliases: {item.aliases.join(", ")}
                        </p>
                      ) : null}

                      {item.jdEvidence.length > 0 ? (
                        <div className="mt-1 space-y-0.5 text-[10px] text-muted-foreground">
                          {item.jdEvidence.map((evidence, evidenceIndex) => (
                            <p
                              key={`${item.id}-evidence-${evidenceIndex}`}
                              className="truncate"
                            >
                              evidence: {evidence}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </article>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Click &quot;Extract Requirements&quot; to generate a prioritized list.
              </p>
            )}

            <div className="mt-3 border-t border-border/60 pt-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Debug JSON
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={copyDebugJson}
                    disabled={!debugJson}
                  >
                    {didCopyDebugJson ? "Copied" : "Copy JSON"}
                  </Button>
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
              </div>
              {requirementsDebugPayload ? (
                isDebugOpen ? (
                  <pre className="mt-2 max-h-56 w-full max-w-full overflow-x-auto overflow-y-auto whitespace-pre-wrap break-words rounded-sm border border-border/50 bg-background/90 p-2 font-mono text-[10px] leading-relaxed text-foreground">
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
          {aiEditError ? (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-[11px] text-destructive">
              {aiEditError}
            </div>
          ) : null}
        </div>
      </ScrollArea>

      <div className="border-t border-border p-4">
        <div className="flex flex-col gap-2">
          {isAiEditing ? (
            <div className="space-y-1">
              <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-[width] duration-200"
                  style={{ width: `${aiEditProgressPercent}%` }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                {aiEditProgress.completed}/{aiEditProgress.total} requirements
              </p>
            </div>
          ) : null}
          <Button
            className="w-full"
            onClick={onAiEdit}
            disabled={!canAiEdit || isAiEditing}
          >
            {isAiEditing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Editing...
              </>
            ) : (
              "AI Edit"
            )}
          </Button>
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
    </div>
  );
}
