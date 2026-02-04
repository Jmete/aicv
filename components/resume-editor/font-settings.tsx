"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FontPreferences } from "@/types";

interface FontSettingsProps {
  preferences: FontPreferences;
  onChange: (preferences: FontPreferences) => void;
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

const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 36;

type FontSizeKey = (typeof FONT_SIZE_FIELDS)[number]["key"];

const clampFontSize = (value: number) =>
  Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, value));

export function FontSettings({ preferences, onChange }: FontSettingsProps) {
  const handleFontFamilyChange = (value: string) => {
    if (!value) return;
    onChange({
      ...preferences,
      family: value as FontPreferences["family"],
    });
  };

  const handleFontSizeChange = (key: FontSizeKey, rawValue: string) => {
    if (rawValue === "") return;
    const parsed = Number.parseFloat(rawValue);
    if (!Number.isFinite(parsed)) return;
    onChange({
      ...preferences,
      sizes: {
        ...preferences.sizes,
        [key]: clampFontSize(parsed),
      },
    });
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-3">
      <div className="space-y-1">
        <h3 className="text-xs font-medium text-foreground">
          Fonts & Size
        </h3>
        <p className="text-[11px] text-muted-foreground">
          Tune the typography for each resume section.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[11px] text-muted-foreground">
          Font Family
        </Label>
        <Select value={preferences.family} onValueChange={handleFontFamilyChange}>
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
        {FONT_SIZE_FIELDS.map((field) => (
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
                value={preferences.sizes[field.key]}
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
