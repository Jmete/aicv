"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

interface BulletListEditorProps {
  bullets: string[];
  label: string;
  placeholder: string;
  minItems?: number;
  onChange: (bullets: string[]) => void;
}

export function BulletListEditor({
  bullets,
  label,
  placeholder,
  minItems = 0,
  onChange,
}: BulletListEditorProps) {
  const updateBullet = (index: number, value: string) => {
    const next = [...bullets];
    next[index] = value;
    onChange(next);
  };

  const addBullet = () => {
    onChange([...bullets, ""]);
  };

  const removeBullet = (index: number) => {
    if (bullets.length <= minItems) return;
    onChange(bullets.filter((_, bulletIndex) => bulletIndex !== index));
  };

  const moveBullet = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= bullets.length) return;

    const next = [...bullets];
    const [movedBullet] = next.splice(index, 1);
    next.splice(targetIndex, 0, movedBullet);
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="space-y-0.5">
          <Label className="text-xs text-muted-foreground">{label}</Label>
          <p className="text-[11px] text-muted-foreground">
            Use the arrows to reorder bullets.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={addBullet}
        >
          <Plus className="mr-1 h-3 w-3" />
          Add Bullet
        </Button>
      </div>

      <div className="space-y-2">
        {bullets.map((bullet, bulletIndex) => (
          <div key={bulletIndex} className="flex gap-2">
            <Textarea
              value={bullet}
              onChange={(event) =>
                updateBullet(bulletIndex, event.target.value)
              }
              placeholder={placeholder}
              className="min-h-[60px] resize-none"
            />
            <div className="flex shrink-0 flex-col gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground"
                onClick={() => moveBullet(bulletIndex, -1)}
                disabled={bulletIndex === 0}
                aria-label={`Move bullet ${bulletIndex + 1} up`}
              >
                <ArrowUp className="h-3 w-3" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground"
                onClick={() => moveBullet(bulletIndex, 1)}
                disabled={bulletIndex === bullets.length - 1}
                aria-label={`Move bullet ${bulletIndex + 1} down`}
              >
                <ArrowDown className="h-3 w-3" />
              </Button>
              {bullets.length > minItems && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => removeBullet(bulletIndex)}
                  aria-label={`Delete bullet ${bulletIndex + 1}`}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
