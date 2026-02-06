"use client";

import { useState } from "react";
import type { ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2, Upload } from "lucide-react";

interface ResumeImportPanelProps {
  onImport: (file: File) => Promise<void>;
  isImporting: boolean;
  error?: string | null;
}

export function ResumeImportPanel({
  onImport,
  isImporting,
  error,
}: ResumeImportPanelProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
  };

  const handleImport = async () => {
    if (!file) return;
    await onImport(file);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (isImporting) return;
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    setIsDragging(false);
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (isImporting) return;
    setIsDragging(false);
    const droppedFile = event.dataTransfer.files?.[0];
    if (!droppedFile) return;
    setFile(droppedFile);
    await onImport(droppedFile);
  };

  return (
    <Card className="border-dashed bg-muted/40">
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Import Resume</p>
            <p className="text-xs text-muted-foreground">
              Upload PDF, DOCX, TXT, MD, or JSON.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-2">
        <div
          className={`rounded-md border border-dashed p-3 transition ${
            isDragging
              ? "border-primary bg-primary/5"
              : "border-border bg-background/60"
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="flex flex-col gap-3">
            <div className="text-xs text-muted-foreground">
              Drag & drop your resume here, or choose a file.
            </div>
            <Input
              type="file"
              accept=".pdf,.docx,.txt,.md,.json"
              onChange={handleFileChange}
              disabled={isImporting}
              className="file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground hover:file:bg-accent"
            />
            <Button
              type="button"
              onClick={handleImport}
              disabled={!file || isImporting}
              className="gap-2"
            >
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Import Resume
                </>
              )}
            </Button>
            {error ? (
              <p className="text-xs text-destructive">{error}</p>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
