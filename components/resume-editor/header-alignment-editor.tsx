"use client";

import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { HeaderAlignment, TextAlignment } from "@/types";
import { AlignCenter, AlignLeft, AlignRight } from "lucide-react";

interface HeaderAlignmentEditorProps {
  alignment: HeaderAlignment;
  onChange: (alignment: HeaderAlignment) => void;
}

interface AlignmentRowProps {
  label: string;
  value: TextAlignment;
  onValueChange: (value: TextAlignment) => void;
}

function AlignmentRow({ label, value, onValueChange }: AlignmentRowProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(nextValue) => {
          if (!nextValue) return;
          onValueChange(nextValue as TextAlignment);
        }}
        variant="outline"
        size="sm"
        className="justify-end"
        aria-label={`${label} alignment`}
      >
        <ToggleGroupItem value="left" className="h-7 px-2 text-[11px]">
          <AlignLeft className="h-3.5 w-3.5" />
          Left
        </ToggleGroupItem>
        <ToggleGroupItem value="center" className="h-7 px-2 text-[11px]">
          <AlignCenter className="h-3.5 w-3.5" />
          Center
        </ToggleGroupItem>
        <ToggleGroupItem value="right" className="h-7 px-2 text-[11px]">
          <AlignRight className="h-3.5 w-3.5" />
          Right
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}

export function HeaderAlignmentEditor({
  alignment,
  onChange,
}: HeaderAlignmentEditorProps) {
  const updateAlignment = (
    field: keyof HeaderAlignment,
    value: TextAlignment
  ) => {
    onChange({
      ...alignment,
      [field]: value,
    });
  };

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-foreground">
          Header Alignment
        </h3>
        <p className="text-xs text-muted-foreground">
          Align each line at the top of your resume.
        </p>
      </div>

      <div className="space-y-3">
        <AlignmentRow
          label="Name"
          value={alignment.name}
          onValueChange={(value) => updateAlignment("name", value)}
        />
        <AlignmentRow
          label="Subtitle"
          value={alignment.subtitle}
          onValueChange={(value) => updateAlignment("subtitle", value)}
        />
        <AlignmentRow
          label="Contact"
          value={alignment.contact}
          onValueChange={(value) => updateAlignment("contact", value)}
        />
      </div>
    </div>
  );
}
