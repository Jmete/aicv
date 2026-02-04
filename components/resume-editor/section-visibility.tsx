"use client";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { SectionVisibility as SectionVisibilityType } from "@/types";

interface SectionVisibilityProps {
  visibility: SectionVisibilityType;
  onChange: (visibility: SectionVisibilityType) => void;
}

const SECTION_LABELS: Record<keyof SectionVisibilityType, string> = {
  summary: "Summary",
  experience: "Experience",
  projects: "Projects",
  education: "Education",
  skills: "Skills",
};

export function SectionVisibility({
  visibility,
  onChange,
}: SectionVisibilityProps) {
  const handleToggle = (section: keyof SectionVisibilityType) => {
    onChange({
      ...visibility,
      [section]: !visibility[section],
    });
  };

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-medium text-foreground">Visible Sections</h3>

      <div className="space-y-3">
        {(Object.keys(SECTION_LABELS) as Array<keyof SectionVisibilityType>).map(
          (section) => (
            <div
              key={section}
              className="flex items-center justify-between"
            >
              <Label
                htmlFor={`section-${section}`}
                className="text-xs text-muted-foreground cursor-pointer"
              >
                {SECTION_LABELS[section]}
              </Label>
              <Switch
                id={`section-${section}`}
                checked={visibility[section]}
                onCheckedChange={() => handleToggle(section)}
              />
            </div>
          )
        )}
      </div>
    </div>
  );
}
