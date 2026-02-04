"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SkillEntry } from "@/types";
import { Plus, Trash2 } from "lucide-react";

interface SkillsEditorProps {
  skills: SkillEntry[];
  onChange: (skills: SkillEntry[]) => void;
}

const SKILL_CATEGORIES = [
  "Programming Languages",
  "Frontend",
  "Backend",
  "Databases",
  "DevOps",
  "Cloud",
  "Tools",
  "Architecture",
  "Methodologies",
  "Other",
];

export function SkillsEditor({ skills, onChange }: SkillsEditorProps) {
  const addSkill = () => {
    const newSkill: SkillEntry = {
      id: crypto.randomUUID(),
      name: "",
      category: "Other",
    };
    onChange([...skills, newSkill]);
  };

  const removeSkill = (id: string) => {
    onChange(skills.filter((s) => s.id !== id));
  };

  const updateSkill = (id: string, updates: Partial<SkillEntry>) => {
    onChange(skills.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  };

  const groupedSkills = skills.reduce(
    (acc, skill) => {
      const category = skill.category || "Other";
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(skill);
      return acc;
    },
    {} as Record<string, SkillEntry[]>
  );

  return (
    <div className="space-y-4">
      {Object.entries(groupedSkills).map(([category, categorySkills]) => (
        <div
          key={category}
          className="space-y-3 rounded-lg border border-border bg-card p-4"
        >
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {category}
          </h3>
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
                <Select
                  value={skill.category}
                  onValueChange={(value) =>
                    updateSkill(skill.id, { category: value })
                  }
                >
                  <SelectTrigger className="h-8 w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SKILL_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
        <Button variant="outline" className="w-full" onClick={addSkill}>
          <Plus className="mr-2 h-4 w-4" />
          Add Skill
        </Button>
      </div>
    </div>
  );
}
