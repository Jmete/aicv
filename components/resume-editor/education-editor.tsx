"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { EducationEntry, EducationOrder } from "@/types";
import { Plus, Trash2 } from "lucide-react";

interface EducationEditorProps {
  education: EducationEntry[];
  order: EducationOrder;
  onOrderChange: (order: EducationOrder) => void;
  onChange: (education: EducationEntry[]) => void;
}

export function EducationEditor({
  education,
  order,
  onOrderChange,
  onChange,
}: EducationEditorProps) {
  const addEntry = () => {
    const newEntry: EducationEntry = {
      id: crypto.randomUUID(),
      degree: "",
      institution: "",
      location: "",
      gpa: "",
    };
    onChange([...education, newEntry]);
  };

  const removeEntry = (id: string) => {
    onChange(education.filter((e) => e.id !== id));
  };

  const updateEntry = (id: string, updates: Partial<EducationEntry>) => {
    onChange(education.map((e) => (e.id === id ? { ...e, ...updates } : e)));
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
              onOrderChange(value as EducationOrder);
            }
          }}
          className="justify-start"
        >
          <ToggleGroupItem
            value="degree-first"
            className="h-7 px-2 text-[11px]"
          >
            Degree on Top
          </ToggleGroupItem>
          <ToggleGroupItem
            value="institution-first"
            className="h-7 px-2 text-[11px]"
          >
            University on Top
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {education.map((entry, index) => (
        <div
          key={entry.id}
          className="space-y-4 rounded-lg border border-border bg-card p-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground">
              Education {index + 1}
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

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              University Name
            </Label>
            <Input
              value={entry.institution ?? ""}
              onChange={(e) =>
                updateEntry(entry.id, { institution: e.target.value })
              }
              placeholder="University Name"
              className="h-9"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Degree</Label>
            <Input
              value={entry.degree}
              onChange={(e) =>
                updateEntry(entry.id, { degree: e.target.value })
              }
              placeholder="Masters of Applied Data Science"
              className="h-9"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                University Location
              </Label>
              <Input
                value={entry.location ?? ""}
                onChange={(e) =>
                  updateEntry(entry.id, { location: e.target.value })
                }
                placeholder="Boston, MA"
                className="h-9"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                GPA (optional)
              </Label>
              <Input
                value={entry.gpa ?? ""}
                onChange={(e) =>
                  updateEntry(entry.id, { gpa: e.target.value })
                }
                placeholder="3.8"
                className="h-9"
              />
            </div>
          </div>
        </div>
      ))}

      <Button variant="outline" className="w-full" onClick={addEntry}>
        <Plus className="mr-2 h-4 w-4" />
        Add Education
      </Button>
    </div>
  );
}
