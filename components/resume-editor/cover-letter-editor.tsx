"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CoverLetterData } from "@/types";

interface CoverLetterEditorProps {
  coverLetter: CoverLetterData;
  onChange: (coverLetter: CoverLetterData) => void;
}

export function CoverLetterEditor({
  coverLetter,
  onChange,
}: CoverLetterEditorProps) {
  const handleChange = (
    field: keyof CoverLetterData,
    value: string
  ) => {
    onChange({ ...coverLetter, [field]: value });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-4 rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-medium text-foreground">
          Recipient
        </h3>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="cl-date" className="text-xs text-muted-foreground">
              Date
            </Label>
            <Input
              id="cl-date"
              value={coverLetter.date}
              onChange={(e) => handleChange("date", e.target.value)}
              placeholder="January 1, 2025"
              className="h-8"
            />
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="cl-hiring-manager"
              className="text-xs text-muted-foreground"
            >
              Hiring Manager
            </Label>
            <Input
              id="cl-hiring-manager"
              value={coverLetter.hiringManager}
              onChange={(e) => handleChange("hiringManager", e.target.value)}
              placeholder="Jane Smith"
              className="h-8"
            />
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="cl-company-address"
              className="text-xs text-muted-foreground"
            >
              Company Address
            </Label>
            <Textarea
              id="cl-company-address"
              value={coverLetter.companyAddress}
              onChange={(e) => handleChange("companyAddress", e.target.value)}
              placeholder={"Acme Corp\n123 Main St\nSan Francisco, CA 94105"}
              className="min-h-[80px] resize-none"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4 rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-medium text-foreground">Body</h3>

        <div className="space-y-2">
          <Textarea
            id="cl-body"
            value={coverLetter.body}
            onChange={(e) => handleChange("body", e.target.value)}
            placeholder="I am writing to express my interest in the position..."
            className="min-h-[160px] resize-none"
          />
        </div>
      </div>

      <div className="space-y-4 rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-medium text-foreground">Sign-off</h3>

        <div className="space-y-2">
          <Input
            id="cl-sendoff"
            value={coverLetter.sendoff}
            onChange={(e) => handleChange("sendoff", e.target.value)}
            placeholder="Best Regards,"
            className="h-8"
          />
        </div>
      </div>
    </div>
  );
}
