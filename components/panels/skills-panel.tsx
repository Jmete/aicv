"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface SkillsPanelProps {
  selectedSkills: number[];
  onSkillToggle: (skillId: number) => void;
}

// Placeholder skills data - will be replaced with database data
const placeholderSkills = [
  { id: 1, name: "JavaScript", category: "Programming Languages" },
  { id: 2, name: "TypeScript", category: "Programming Languages" },
  { id: 3, name: "Python", category: "Programming Languages" },
  { id: 4, name: "React", category: "Frontend" },
  { id: 5, name: "Next.js", category: "Frontend" },
  { id: 6, name: "Node.js", category: "Backend" },
  { id: 7, name: "PostgreSQL", category: "Databases" },
  { id: 8, name: "MongoDB", category: "Databases" },
  { id: 9, name: "Docker", category: "DevOps" },
  { id: 10, name: "AWS", category: "Cloud" },
  { id: 11, name: "Git", category: "Tools" },
  { id: 12, name: "REST APIs", category: "Architecture" },
  { id: 13, name: "GraphQL", category: "Architecture" },
  { id: 14, name: "Agile/Scrum", category: "Methodologies" },
  { id: 15, name: "CI/CD", category: "DevOps" },
];

// Group skills by category
const groupedSkills = placeholderSkills.reduce(
  (acc, skill) => {
    if (!acc[skill.category]) {
      acc[skill.category] = [];
    }
    acc[skill.category].push(skill);
    return acc;
  },
  {} as Record<string, typeof placeholderSkills>
);

export function SkillsPanel({ selectedSkills, onSkillToggle }: SkillsPanelProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-4">
        <h2 className="text-sm font-medium text-foreground">Relevant Skills</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {selectedSkills.length} selected
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-6 p-4">
          {Object.entries(groupedSkills).map(([category, skills]) => (
            <div key={category}>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {category}
              </h3>
              <div className="space-y-1">
                {skills.map((skill) => (
                  <label
                    key={skill.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-accent",
                      selectedSkills.includes(skill.id) && "bg-accent"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selectedSkills.includes(skill.id)}
                      onChange={() => onSkillToggle(skill.id)}
                      className="h-4 w-4 rounded border-input bg-background text-primary focus:ring-ring"
                    />
                    <span className="text-sm text-foreground">{skill.name}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
