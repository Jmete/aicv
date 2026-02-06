"use client";

import { useMemo, useState } from "react";
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
  DEFAULT_PAGE_SETTINGS,
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
  const [activeMarginTarget, setActiveMarginTarget] = useState<
    "resume" | "cover-letter"
  >("resume");

  const resolvedSettings = useMemo(() => {
    const legacyMargins =
      settings.margins ?? DEFAULT_PAGE_SETTINGS.resumeMargins;
    const legacyPreset =
      settings.marginPreset ?? DEFAULT_PAGE_SETTINGS.resumeMarginPreset;

    return {
      paperSize: settings.paperSize ?? DEFAULT_PAGE_SETTINGS.paperSize,
      resumeMargins: settings.resumeMargins ?? legacyMargins,
      resumeMarginPreset: settings.resumeMarginPreset ?? legacyPreset,
      coverLetterMargins: settings.coverLetterMargins ?? legacyMargins,
      coverLetterMarginPreset: settings.coverLetterMarginPreset ?? legacyPreset,
    };
  }, [settings]);

  const commitSettings = (next: {
    paperSize: PaperSize;
    resumeMargins: PageSettingsType["resumeMargins"];
    resumeMarginPreset: MarginPreset;
    coverLetterMargins: PageSettingsType["coverLetterMargins"];
    coverLetterMarginPreset: MarginPreset;
  }) => {
    onChange({
      ...settings,
      ...next,
      // Keep legacy fields synced for older readers.
      margins: next.resumeMargins,
      marginPreset: next.resumeMarginPreset,
    });
  };

  const handlePaperSizeChange = (value: string) => {
    if (value) {
      commitSettings({
        ...resolvedSettings,
        paperSize: value as PaperSize,
      });
    }
  };

  const handleMarginPresetChange = (value: MarginPreset) => {
    if (activeMarginTarget === "resume") {
      commitSettings({
        ...resolvedSettings,
        resumeMarginPreset: value,
        resumeMargins: MARGIN_PRESETS[value],
      });
      return;
    }

    commitSettings({
      ...resolvedSettings,
      coverLetterMarginPreset: value,
      coverLetterMargins: MARGIN_PRESETS[value],
    });
  };

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-2.5">
      <h3 className="text-[11px] font-medium text-foreground">Page Settings</h3>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <Label className="text-[10px] text-muted-foreground">Paper</Label>
          <ToggleGroup
            type="single"
            value={resolvedSettings.paperSize}
            onValueChange={handlePaperSizeChange}
            className="justify-start"
          >
            <ToggleGroupItem value="letter" className="h-6 px-2 text-[10px]">
              Letter
            </ToggleGroupItem>
            <ToggleGroupItem value="a4" className="h-6 px-2 text-[10px]">
              A4
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="flex items-center gap-1.5">
          <Label className="text-[10px] text-muted-foreground">Margins</Label>
          <ToggleGroup
            type="single"
            value={activeMarginTarget}
            onValueChange={(value) => {
              if (!value) return;
              setActiveMarginTarget(value as "resume" | "cover-letter");
            }}
            className="justify-start"
            aria-label="Margin settings target"
          >
            <ToggleGroupItem value="resume" className="h-6 px-2 text-[10px]">
              Resume
            </ToggleGroupItem>
            <ToggleGroupItem
              value="cover-letter"
              className="h-6 px-2 text-[10px]"
            >
              Cover
            </ToggleGroupItem>
          </ToggleGroup>
          <Select
            value={
              activeMarginTarget === "resume"
                ? resolvedSettings.resumeMarginPreset
                : resolvedSettings.coverLetterMarginPreset
            }
            onValueChange={(value) =>
              handleMarginPresetChange(value as MarginPreset)
            }
          >
            <SelectTrigger className="h-6 w-[128px] text-[10px]">
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
