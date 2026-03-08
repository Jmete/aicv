"use client";

import { BulletListEditor } from "@/components/resume-editor/bullet-list-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { createId } from "@/lib/id";
import type { ExperienceEntry, ExperienceOrder } from "@/types";
import { Plus, Trash2 } from "lucide-react";

interface ExperienceEditorProps {
  experience: ExperienceEntry[];
  order: ExperienceOrder;
  onOrderChange: (order: ExperienceOrder) => void;
  onChange: (experience: ExperienceEntry[]) => void;
}

export function ExperienceEditor({
  experience,
  order,
  onOrderChange,
  onChange,
}: ExperienceEditorProps) {
  const addEntry = () => {
    const newEntry: ExperienceEntry = {
      id: createId(),
      company: "",
      jobTitle: "",
      location: "",
      startDate: "",
      endDate: "",
      bullets: [""],
    };
    onChange([...experience, newEntry]);
  };

  const removeEntry = (id: string) => {
    onChange(experience.filter((e) => e.id !== id));
  };

  const updateEntry = (id: string, updates: Partial<ExperienceEntry>) => {
    onChange(
      experience.map((e) => (e.id === id ? { ...e, ...updates } : e))
    );
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-lg border border-border bg-card p-3">
        <Label className="text-xs text-muted-foreground">Display Order</Label>
        <ToggleGroup
          type="single"
          value={order}
          onValueChange={(value) => {
            if (value) {
              onOrderChange(value as ExperienceOrder);
            }
          }}
          className="justify-start"
        >
          <ToggleGroupItem
            value="title-first"
            className="h-7 px-2 text-[11px]"
          >
            Title on Top
          </ToggleGroupItem>
          <ToggleGroupItem
            value="company-first"
            className="h-7 px-2 text-[11px]"
          >
            Company on Top
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {experience.map((entry, index) => (
        <div
          key={entry.id}
          className="space-y-4 rounded-lg border border-border bg-card p-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground">
              Experience {index + 1}
            </h3>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={() => removeEntry(entry.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Company</Label>
              <Input
                value={entry.company}
                onChange={(e) =>
                  updateEntry(entry.id, { company: e.target.value })
                }
                placeholder="Company Name"
                className="h-8"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Job Title</Label>
              <Input
                value={entry.jobTitle}
                onChange={(e) =>
                  updateEntry(entry.id, { jobTitle: e.target.value })
                }
                placeholder="Software Engineer"
                className="h-8"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Location</Label>
            <Input
              value={entry.location}
              onChange={(e) =>
                updateEntry(entry.id, { location: e.target.value })
              }
              placeholder="San Francisco, CA"
              className="h-8"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Start Date</Label>
              <Input
                value={entry.startDate}
                onChange={(e) =>
                  updateEntry(entry.id, { startDate: e.target.value })
                }
                placeholder="Jan 2022"
                className="h-8"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">End Date</Label>
              <Input
                value={entry.endDate}
                onChange={(e) =>
                  updateEntry(entry.id, { endDate: e.target.value })
                }
                placeholder="Present"
                className="h-8"
              />
            </div>
          </div>

          <BulletListEditor
            bullets={entry.bullets}
            label="Responsibilities & Achievements"
            placeholder="Describe your accomplishment..."
            minItems={1}
            onChange={(bullets) => updateEntry(entry.id, { bullets })}
          />
        </div>
      ))}

      <Button
        variant="outline"
        className="w-full"
        onClick={addEntry}
      >
        <Plus className="mr-2 h-4 w-4" />
        Add Experience
      </Button>
    </div>
  );
}
