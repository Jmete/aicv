"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
      id: crypto.randomUUID(),
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

  const updateBullet = (entryId: string, bulletIndex: number, value: string) => {
    const entry = experience.find((e) => e.id === entryId);
    if (!entry) return;

    const newBullets = [...entry.bullets];
    newBullets[bulletIndex] = value;
    updateEntry(entryId, { bullets: newBullets });
  };

  const addBullet = (entryId: string) => {
    const entry = experience.find((e) => e.id === entryId);
    if (!entry) return;

    updateEntry(entryId, { bullets: [...entry.bullets, ""] });
  };

  const removeBullet = (entryId: string, bulletIndex: number) => {
    const entry = experience.find((e) => e.id === entryId);
    if (!entry || entry.bullets.length <= 1) return;

    const newBullets = entry.bullets.filter((_, i) => i !== bulletIndex);
    updateEntry(entryId, { bullets: newBullets });
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
                className="h-9"
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
                className="h-9"
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
              className="h-9"
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
                className="h-9"
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
                className="h-9"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Responsibilities & Achievements
            </Label>
            {entry.bullets.map((bullet, bulletIndex) => (
              <div key={bulletIndex} className="flex gap-2">
                <Textarea
                  value={bullet}
                  onChange={(e) =>
                    updateBullet(entry.id, bulletIndex, e.target.value)
                  }
                  placeholder="Describe your accomplishment..."
                  className="min-h-[60px] resize-none"
                />
                {entry.bullets.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeBullet(entry.id, bulletIndex)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => addBullet(entry.id)}
            >
              <Plus className="mr-1 h-3 w-3" />
              Add Bullet
            </Button>
          </div>
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
