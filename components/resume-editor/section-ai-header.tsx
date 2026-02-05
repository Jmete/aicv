"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SectionKey } from "@/types";
import { Sparkles } from "lucide-react";

interface SectionAiHeaderProps {
  title: string;
  section: SectionKey;
  placeholder?: string;
}

export function SectionAiHeader({
  title,
  section,
  placeholder = "Ask AI to improve this section...",
}: SectionAiHeaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const statusTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current) {
        window.clearTimeout(statusTimeoutRef.current);
        statusTimeoutRef.current = null;
      }
    };
  }, []);

  const submit = () => {
    const instruction = prompt.trim();
    if (!instruction) return;
    window.dispatchEvent(
      new CustomEvent("resume-section-ai", {
        detail: { section, instruction },
      })
    );
    setPrompt("");
    setStatus("Sent to preview. Review suggestions there.");
    setIsOpen(true);
    if (statusTimeoutRef.current) {
      window.clearTimeout(statusTimeoutRef.current);
    }
    statusTimeoutRef.current = window.setTimeout(() => {
      setStatus(null);
      statusTimeoutRef.current = null;
    }, 1800);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={() => setIsOpen((current) => !current)}
          aria-label={`AI edit ${title}`}
        >
          <Sparkles className="h-4 w-4" />
        </Button>
      </div>
      {isOpen && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Input
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={placeholder}
              className="h-8 text-xs"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submit();
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={submit}
              disabled={!prompt.trim()}
            >
              Run
            </Button>
          </div>
          {status && (
            <p className="text-[11px] text-muted-foreground">{status}</p>
          )}
        </div>
      )}
    </div>
  );
}
