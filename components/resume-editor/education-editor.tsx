"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EducationEntry } from "@/types";
import { Plus, Trash2 } from "lucide-react";

interface EducationEditorProps {
  education: EducationEntry[];
  onChange: (education: EducationEntry[]) => void;
}

export function EducationEditor({ education, onChange }: EducationEditorProps) {
  const addEntry = () => {
    const newEntry: EducationEntry = {
      id: crypto.randomUUID(),
      institution: "",
      degree: "",
      field: "",
      graduationDate: "",
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
            <Label className="text-xs text-muted-foreground">Institution</Label>
            <Input
              value={entry.institution}
              onChange={(e) =>
                updateEntry(entry.id, { institution: e.target.value })
              }
              placeholder="University Name"
              className="h-9"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Degree</Label>
              <Input
                value={entry.degree}
                onChange={(e) =>
                  updateEntry(entry.id, { degree: e.target.value })
                }
                placeholder="Bachelor of Science"
                className="h-9"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Field of Study
              </Label>
              <Input
                value={entry.field}
                onChange={(e) =>
                  updateEntry(entry.id, { field: e.target.value })
                }
                placeholder="Computer Science"
                className="h-9"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Graduation Date
              </Label>
              <Input
                value={entry.graduationDate}
                onChange={(e) =>
                  updateEntry(entry.id, { graduationDate: e.target.value })
                }
                placeholder="May 2023"
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
