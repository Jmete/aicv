"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  MARGIN_PRESETS,
  type MarginPreset,
  type PaperSize,
} from "@/lib/resume-defaults";
import type { PageSettings as PageSettingsType } from "@/types";

interface PageSettingsProps {
  settings: PageSettingsType;
  onChange: (settings: PageSettingsType) => void;
}

export function PageSettings({ settings, onChange }: PageSettingsProps) {
  const handlePaperSizeChange = (value: string) => {
    if (value) {
      onChange({
        ...settings,
        paperSize: value as PaperSize,
      });
    }
  };

  const handleMarginPresetChange = (value: MarginPreset) => {
    onChange({
      ...settings,
      marginPreset: value,
      margins: MARGIN_PRESETS[value],
    });
  };

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-medium text-foreground">Page Settings</h3>

      <div className="space-y-3">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Paper Size</Label>
          <ToggleGroup
            type="single"
            value={settings.paperSize}
            onValueChange={handlePaperSizeChange}
            className="justify-start"
          >
            <ToggleGroupItem value="letter" className="text-xs">
              Letter
            </ToggleGroupItem>
            <ToggleGroupItem value="a4" className="text-xs">
              A4
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Margins</Label>
          <Select
            value={settings.marginPreset}
            onValueChange={handleMarginPresetChange}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="narrow">Narrow (0.5&quot;)</SelectItem>
              <SelectItem value="moderate">Moderate (0.79&quot;)</SelectItem>
              <SelectItem value="normal">Normal (1&quot;)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
