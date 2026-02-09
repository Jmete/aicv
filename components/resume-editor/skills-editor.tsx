"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createId } from "@/lib/id";
import type { SkillEntry } from "@/types";
import { GripVertical, Plus, Trash2 } from "lucide-react";

interface SkillsEditorProps {
  skills: SkillEntry[];
  onChange: (skills: SkillEntry[]) => void;
}

export function SkillsEditor({ skills, onChange }: SkillsEditorProps) {
  const [newSkillGroup, setNewSkillGroup] = useState("");
  const [draggingSkillId, setDraggingSkillId] = useState<string | null>(null);

  const addSkill = (category = "") => {
    const newSkill: SkillEntry = {
      id: createId(),
      name: "",
      category,
    };
    onChange([...skills, newSkill]);
  };

  const removeSkill = (id: string) => {
    onChange(skills.filter((s) => s.id !== id));
  };

  const updateSkill = (id: string, updates: Partial<SkillEntry>) => {
    onChange(skills.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  };

  const reorderSkills = (fromId: string, targetId: string) => {
    if (fromId === targetId) return;

    const fromIndex = skills.findIndex((skill) => skill.id === fromId);
    const targetIndex = skills.findIndex((skill) => skill.id === targetId);
    if (fromIndex < 0 || targetIndex < 0) return;

    const next = [...skills];
    const [moved] = next.splice(fromIndex, 1);
    const insertIndex = targetIndex > fromIndex ? targetIndex - 1 : targetIndex;
    next.splice(insertIndex, 0, moved);
    onChange(next);
  };

  const groupedSkills = useMemo(() => {
    return skills.reduce(
      (acc, skill) => {
        const category = (skill.category || "").trim();
        if (!acc[category]) {
          acc[category] = [];
        }
        acc[category].push(skill);
        return acc;
      },
      {} as Record<string, SkillEntry[]>
    );
  }, [skills]);

  const handleAddSkill = () => {
    addSkill(newSkillGroup.trim());
    setNewSkillGroup("");
  };

  return (
    <div className="space-y-4">
      {Object.entries(groupedSkills).map(([category, categorySkills]) => (
        <div
          key={category}
          className="space-y-3 rounded-lg border border-border bg-card p-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {category || "Ungrouped"}
            </h3>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => addSkill(category)}
            >
              <Plus className="mr-1 h-3 w-3" />
              Add Skill
            </Button>
          </div>
          <div className="space-y-2">
            {categorySkills.map((skill) => (
              <div
                key={skill.id}
                className="flex items-center gap-2 rounded-md border border-transparent px-1 py-1 transition-colors hover:border-border"
                draggable
                onDragStart={(event) => {
                  setDraggingSkillId(skill.id);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", skill.id);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragEnd={() => setDraggingSkillId(null)}
                onDrop={(event) => {
                  event.preventDefault();
                  if (!draggingSkillId) return;
                  reorderSkills(draggingSkillId, skill.id);
                  setDraggingSkillId(null);
                }}
              >
                <div className="shrink-0 cursor-grab text-muted-foreground/70">
                  <GripVertical className="h-4 w-4" />
                </div>
                <Input
                  value={skill.name}
                  onChange={(e) =>
                    updateSkill(skill.id, { name: e.target.value })
                  }
                  placeholder="Skill name"
                  className="h-8 flex-1"
                />
                <Input
                  value={skill.category}
                  onChange={(e) =>
                    updateSkill(skill.id, { category: e.target.value })
                  }
                  placeholder="Group (optional)"
                  className="h-8 w-[160px]"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeSkill(skill.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {skills.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No skills added yet. Click below to add your first skill.
          </p>
        </div>
      )}

      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        <Label className="text-xs text-muted-foreground">Add New Skill</Label>
        <Input
          value={newSkillGroup}
          onChange={(e) => setNewSkillGroup(e.target.value)}
          placeholder="Group name (optional)"
          className="h-8"
        />
        <Button variant="outline" className="w-full" onClick={handleAddSkill}>
          <Plus className="mr-2 h-4 w-4" />
          Add Skill
        </Button>
      </div>
    </div>
  );
}
