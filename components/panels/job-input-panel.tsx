"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ApplicationFormData } from "@/components/layout/app-layout";

interface JobInputPanelProps {
  formData: ApplicationFormData;
  onChange: (data: ApplicationFormData) => void;
  onAnalyze: () => void;
  onSave: () => void;
  isAnalyzing: boolean;
}

export function JobInputPanel({
  formData,
  onChange,
  onAnalyze,
  onSave,
  isAnalyzing,
}: JobInputPanelProps) {
  const handleChange = (
    field: keyof ApplicationFormData,
    value: string
  ) => {
    onChange({ ...formData, [field]: value });
  };

  const canSave =
    formData.companyName.trim() &&
    formData.jobTitle.trim() &&
    formData.jobDescription.trim();

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
            <Input
              id="jobUrl"
              type="url"
              placeholder="https://..."
              value={formData.jobUrl}
              onChange={(e) => handleChange("jobUrl", e.target.value)}
            />
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
              onChange={(e) => handleChange("companyName", e.target.value)}
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
              onChange={(e) => handleChange("jobTitle", e.target.value)}
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
              onChange={(e) => handleChange("jobDescription", e.target.value)}
            />
          </div>
        </div>
      </ScrollArea>

      <div className="border-t border-border p-4">
        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={onAnalyze}
            disabled={!formData.jobDescription.trim() || isAnalyzing}
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
      </div>
    </div>
  );
}
