"use client";

import { useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type {
  SectionKey,
  SectionVisibility as SectionVisibilityType,
} from "@/types";
import { GripVertical } from "lucide-react";

interface SectionVisibilityProps {
  visibility: SectionVisibilityType;
  order: SectionKey[];
  onOrderChange: (order: SectionKey[]) => void;
  onChange: (visibility: SectionVisibilityType) => void;
}

const SECTION_LABELS: Record<SectionKey, string> = {
  summary: "Summary",
  experience: "Experience",
  projects: "Projects",
  education: "Education",
  skills: "Skills",
};

export function SectionVisibility({
  visibility,
  order,
  onOrderChange,
  onChange,
}: SectionVisibilityProps) {
  const [dragging, setDragging] = useState<SectionKey | null>(null);

  const orderedSections = useMemo(() => {
    const allSections = Object.keys(SECTION_LABELS) as SectionKey[];
    const seen = new Set<SectionKey>();
    const combined = [...order, ...allSections].filter((section) => {
      if (!SECTION_LABELS[section] || seen.has(section)) {
        return false;
      }
      seen.add(section);
      return true;
    });
    return combined;
  }, [order]);

  const handleToggle = (section: keyof SectionVisibilityType) => {
    onChange({
      ...visibility,
      [section]: !visibility[section],
    });
  };

  const handleDrop = (target: SectionKey) => {
    if (!dragging || dragging === target) return;
    const next = orderedSections.filter((section) => section !== dragging);
    const targetIndex = next.indexOf(target);
    next.splice(targetIndex, 0, dragging);
    onOrderChange(next);
    setDragging(null);
  };

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-medium text-foreground">Visible Sections</h3>
      <p className="text-xs text-muted-foreground">
        Drag rows to reorder.
      </p>

      <div className="space-y-3">
        {orderedSections.map((section) => (
          <div
            key={section}
            className="flex items-center justify-between rounded-md border border-transparent px-1.5 py-1 transition-colors hover:border-border"
            draggable
            onDragStart={(event) => {
              setDragging(section);
              event.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragEnd={() => setDragging(null)}
            onDrop={() => handleDrop(section)}
          >
            <div className="flex items-center gap-2">
              <GripVertical className="h-4 w-4 text-muted-foreground/70" />
              <Label
                htmlFor={`section-${section}`}
                className="text-xs text-muted-foreground cursor-pointer"
              >
                {SECTION_LABELS[section]}
              </Label>
            </div>
            <Switch
              id={`section-${section}`}
              checked={visibility[section]}
              onCheckedChange={() => handleToggle(section)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
