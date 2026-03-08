"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MAX_LAYOUT_SPACING,
  MIN_LAYOUT_SPACING,
  clampLayoutSpacing,
  type LayoutSpacing,
} from "@/lib/resume-defaults";

interface SpacingSettingsProps {
  spacing: LayoutSpacing;
  onChange: (spacing: LayoutSpacing) => void;
}

const SPACING_FIELDS = [
  {
    key: "nameGap",
    label: "Name to Subtitle",
    description: "Space between the header name and subtitle.",
  },
  {
    key: "contactGap",
    label: "Subtitle to Contact",
    description: "Space between the subtitle and contact line.",
  },
  {
    key: "bulletGap",
    label: "Bullet Spacing",
    description: "Space between bullet points inside an entry.",
  },
  {
    key: "entryGap",
    label: "Entry Spacing",
    description: "Space between jobs, projects, and education entries.",
  },
  {
    key: "sectionGap",
    label: "Section Spacing",
    description: "Space between major sections like Experience and Education.",
  },
] as const;

type SpacingKey = (typeof SPACING_FIELDS)[number]["key"];

export function SpacingSettings({
  spacing,
  onChange,
}: SpacingSettingsProps) {
  const handleSpacingChange = (key: SpacingKey, rawValue: string) => {
    if (rawValue === "") return;
    const parsed = Number.parseFloat(rawValue);
    if (!Number.isFinite(parsed)) return;
    onChange({
      ...spacing,
      [key]: clampLayoutSpacing(parsed),
    });
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-3">
      <div className="space-y-1">
        <h3 className="text-xs font-medium text-foreground">Spacing</h3>
        <p className="text-[11px] text-muted-foreground">
          Adjust the header and body spacing throughout the document.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SPACING_FIELDS.map((field) => (
          <div key={field.key} className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">
              {field.label}
            </Label>
            <Input
              type="number"
              min={MIN_LAYOUT_SPACING}
              max={MAX_LAYOUT_SPACING}
              step={0.5}
              inputMode="decimal"
              value={spacing[field.key]}
              onChange={(event) =>
                handleSpacingChange(field.key, event.target.value)
              }
              className="h-8 text-xs"
            />
            <p className="text-[10px] leading-tight text-muted-foreground">
              {field.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
