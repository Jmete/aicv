"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { FontPreferences } from "@/types";

interface FontSettingsProps {
  resumePreferences: FontPreferences;
  coverLetterPreferences: FontPreferences;
  onResumeChange: (preferences: FontPreferences) => void;
  onCoverLetterChange: (preferences: FontPreferences) => void;
}

const FONT_SIZE_FIELDS = [
  { key: "name", label: "Name" },
  { key: "subtitle", label: "Subtitle" },
  { key: "contact", label: "Contact" },
  { key: "sectionTitle", label: "Section Titles" },
  { key: "itemTitle", label: "Entry Titles" },
  { key: "itemDetail", label: "Details" },
  { key: "itemMeta", label: "Dates & Meta" },
  { key: "body", label: "Body" },
] as const;

const FONT_FAMILY_LABELS = {
  serif: "Serif (Classic)",
  sans: "Sans (Modern)",
  mono: "Mono (Technical)",
} as const;

const FONT_TARGETS = [
  { key: "resume", label: "Resume" },
  { key: "cover-letter", label: "Cover Letter" },
] as const;

const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 36;

type FontSizeKey = (typeof FONT_SIZE_FIELDS)[number]["key"];
type FontTarget = (typeof FONT_TARGETS)[number]["key"];

const COVER_LETTER_FONT_FIELDS: Array<{ key: FontSizeKey; label: string }> = [
  { key: "itemMeta", label: "Date" },
  { key: "body", label: "Body" },
];

const clampFontSize = (value: number) =>
  Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, value));

export function FontSettings({
  resumePreferences,
  coverLetterPreferences,
  onResumeChange,
  onCoverLetterChange,
}: FontSettingsProps) {
  const [activeTarget, setActiveTarget] = useState<FontTarget>("resume");
  const activePreferences =
    activeTarget === "resume" ? resumePreferences : coverLetterPreferences;
  const activeFields =
    activeTarget === "resume" ? FONT_SIZE_FIELDS : COVER_LETTER_FONT_FIELDS;

  const commitPreferences = (nextPreferences: FontPreferences) => {
    if (activeTarget === "resume") {
      onResumeChange(nextPreferences);
    } else {
      onCoverLetterChange(nextPreferences);
    }
  };

  const handleFontFamilyChange = (value: string) => {
    if (!value) return;
    commitPreferences({
      ...activePreferences,
      family: value as FontPreferences["family"],
    });
  };

  const handleFontSizeChange = (key: FontSizeKey, rawValue: string) => {
    if (rawValue === "") return;
    const parsed = Number.parseFloat(rawValue);
    if (!Number.isFinite(parsed)) return;
    commitPreferences({
      ...activePreferences,
      sizes: {
        ...activePreferences.sizes,
        [key]: clampFontSize(parsed),
      },
    });
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-xs font-medium text-foreground">
            Fonts & Size
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Tune the typography for the selected document.
          </p>
        </div>
        <ToggleGroup
          type="single"
          value={activeTarget}
          onValueChange={(value) => {
            if (!value) return;
            setActiveTarget(value as FontTarget);
          }}
          size="sm"
          variant="outline"
          className="shrink-0"
          aria-label="Font settings target"
        >
          {FONT_TARGETS.map((target) => (
            <ToggleGroupItem
              key={target.key}
              value={target.key}
              className="h-7 px-2 text-[11px]"
            >
              {target.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[11px] text-muted-foreground">
          Font Family
        </Label>
        <Select
          value={activePreferences.family}
          onValueChange={handleFontFamilyChange}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(FONT_FAMILY_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {activeFields.map((field) => (
          <div key={field.key} className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">
              {field.label}
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={MIN_FONT_SIZE}
                max={MAX_FONT_SIZE}
                step={0.5}
                inputMode="decimal"
                value={activePreferences.sizes[field.key]}
                onChange={(event) =>
                  handleFontSizeChange(field.key, event.target.value)
                }
                className="h-8 text-xs"
              />
              <span className="text-[10px] text-muted-foreground">px</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
