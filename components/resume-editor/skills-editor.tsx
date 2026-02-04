"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SkillEntry } from "@/types";
import { Plus, Trash2 } from "lucide-react";

interface SkillsEditorProps {
  skills: SkillEntry[];
  onChange: (skills: SkillEntry[]) => void;
}

export function SkillsEditor({ skills, onChange }: SkillsEditorProps) {
  const [newSkillGroup, setNewSkillGroup] = useState("");

  const addSkill = (category = "") => {
    const newSkill: SkillEntry = {
      id: crypto.randomUUID(),
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
              <div key={skill.id} className="flex items-center gap-2">
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
          className="h-9"
        />
        <Button variant="outline" className="w-full" onClick={handleAddSkill}>
          <Plus className="mr-2 h-4 w-4" />
          Add Skill
        </Button>
      </div>
    </div>
  );
}
