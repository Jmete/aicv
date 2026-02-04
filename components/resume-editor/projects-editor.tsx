"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ProjectEntry } from "@/types";
import { Plus, Trash2 } from "lucide-react";

interface ProjectsEditorProps {
  projects: ProjectEntry[];
  onChange: (projects: ProjectEntry[]) => void;
}

export function ProjectsEditor({ projects, onChange }: ProjectsEditorProps) {
  const [technologyInputs, setTechnologyInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    setTechnologyInputs((prev) => {
      const next = { ...prev };
      const ids = new Set(projects.map((project) => project.id));
      let changed = false;

      Object.keys(next).forEach((id) => {
        if (!ids.has(id)) {
          delete next[id];
          changed = true;
        }
      });

      projects.forEach((project) => {
        if (next[project.id] === undefined) {
          next[project.id] = project.technologies.join(", ");
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [projects]);

  const addEntry = () => {
    const newEntry: ProjectEntry = {
      id: crypto.randomUUID(),
      name: "",
      description: "",
      technologies: [],
      bullets: [],
    };
    onChange([...projects, newEntry]);
  };

  const removeEntry = (id: string) => {
    onChange(projects.filter((p) => p.id !== id));
  };

  const updateEntry = (id: string, updates: Partial<ProjectEntry>) => {
    onChange(projects.map((p) => (p.id === id ? { ...p, ...updates } : p)));
  };

  const updateBullet = (entryId: string, bulletIndex: number, value: string) => {
    const entry = projects.find((p) => p.id === entryId);
    if (!entry) return;

    const newBullets = [...entry.bullets];
    newBullets[bulletIndex] = value;
    updateEntry(entryId, { bullets: newBullets });
  };

  const addBullet = (entryId: string) => {
    const entry = projects.find((p) => p.id === entryId);
    if (!entry) return;

    updateEntry(entryId, { bullets: [...entry.bullets, ""] });
  };

  const removeBullet = (entryId: string, bulletIndex: number) => {
    const entry = projects.find((p) => p.id === entryId);
    if (!entry) return;

    const newBullets = entry.bullets.filter((_, i) => i !== bulletIndex);
    updateEntry(entryId, { bullets: newBullets });
  };

  const handleTechnologiesChange = (id: string, value: string) => {
    setTechnologyInputs((prev) => ({ ...prev, [id]: value }));
    const technologies = value
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    updateEntry(id, { technologies });
  };

  return (
    <div className="space-y-4">
      {projects.map((entry, index) => (
        <div
          key={entry.id}
          className="space-y-4 rounded-lg border border-border bg-card p-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground">
              Project {index + 1}
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
            <Label className="text-xs text-muted-foreground">Project Name</Label>
            <Input
              value={entry.name}
              onChange={(e) => updateEntry(entry.id, { name: e.target.value })}
              placeholder="My Awesome Project"
              className="h-9"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Description</Label>
            <Textarea
              value={entry.description}
              onChange={(e) =>
                updateEntry(entry.id, { description: e.target.value })
              }
              placeholder="Brief description of the project..."
              className="min-h-[60px] resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Technologies (comma-separated)
            </Label>
            <Input
              value={technologyInputs[entry.id] ?? entry.technologies.join(", ")}
              onChange={(e) =>
                handleTechnologiesChange(entry.id, e.target.value)
              }
              placeholder="React, TypeScript, Node.js"
              className="h-9"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs text-muted-foreground">
                Bullet Points
              </Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => addBullet(entry.id)}
              >
                <Plus className="mr-1 h-3 w-3" />
                Add Bullet
              </Button>
            </div>
            {entry.bullets.map((bullet, bulletIndex) => (
              <div key={bulletIndex} className="flex gap-2">
                <Textarea
                  value={bullet}
                  onChange={(e) =>
                    updateBullet(entry.id, bulletIndex, e.target.value)
                  }
                  placeholder="Describe a bullet point..."
                  className="min-h-[60px] resize-none"
                />
                {entry.bullets.length > 0 && (
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
          </div>
        </div>
      ))}

      <Button variant="outline" className="w-full" onClick={addEntry}>
        <Plus className="mr-2 h-4 w-4" />
        Add Project
      </Button>
    </div>
  );
}
