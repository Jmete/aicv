"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ResumeMetadata } from "@/types";

interface MetadataEditorProps {
  metadata: ResumeMetadata;
  onChange: (metadata: ResumeMetadata) => void;
}

export function MetadataEditor({ metadata, onChange }: MetadataEditorProps) {
  const handleFieldChange = (field: keyof ResumeMetadata, value: string) => {
    onChange({
      ...metadata,
      [field]: value,
    });
  };

  const handleContactChange = (
    field: keyof ResumeMetadata["contactInfo"],
    value: string
  ) => {
    onChange({
      ...metadata,
      contactInfo: {
        ...metadata.contactInfo,
        [field]: value,
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-medium text-foreground">
          Personal Information
        </h3>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="fullName" className="text-xs text-muted-foreground">
              Full Name
            </Label>
            <Input
              id="fullName"
              value={metadata.fullName}
              onChange={(e) => handleFieldChange("fullName", e.target.value)}
              placeholder="John Doe"
              className="h-9"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="subtitle" className="text-xs text-muted-foreground">
              Subtitle
            </Label>
            <Input
              id="subtitle"
              value={metadata.subtitle}
              onChange={(e) => handleFieldChange("subtitle", e.target.value)}
              placeholder="Software Engineer | Full Stack Developer"
              className="h-9"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="text-xs text-muted-foreground">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              value={metadata.contactInfo.email}
              onChange={(e) => handleContactChange("email", e.target.value)}
              placeholder="john@example.com"
              className="h-9"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone" className="text-xs text-muted-foreground">
              Phone
            </Label>
            <Input
              id="phone"
              type="tel"
              value={metadata.contactInfo.phone}
              onChange={(e) => handleContactChange("phone", e.target.value)}
              placeholder="(555) 123-4567"
              className="h-9"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="location" className="text-xs text-muted-foreground">
              Location
            </Label>
            <Input
              id="location"
              value={metadata.contactInfo.location}
              onChange={(e) => handleContactChange("location", e.target.value)}
              placeholder="San Francisco, CA"
              className="h-9"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4 rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-medium text-foreground">Online Profiles</h3>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="linkedin" className="text-xs text-muted-foreground">
              LinkedIn
            </Label>
            <Input
              id="linkedin"
              value={metadata.contactInfo.linkedin ?? ""}
              onChange={(e) => handleContactChange("linkedin", e.target.value)}
              placeholder="linkedin.com/in/johndoe"
              className="h-9"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="website" className="text-xs text-muted-foreground">
              Website
            </Label>
            <Input
              id="website"
              value={metadata.contactInfo.website ?? ""}
              onChange={(e) => handleContactChange("website", e.target.value)}
              placeholder="johndoe.com"
              className="h-9"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="github" className="text-xs text-muted-foreground">
              GitHub
            </Label>
            <Input
              id="github"
              value={metadata.contactInfo.github ?? ""}
              onChange={(e) => handleContactChange("github", e.target.value)}
              placeholder="github.com/johndoe"
              className="h-9"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4 rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-medium text-foreground">
          Professional Summary
        </h3>

        <div className="space-y-2">
          <Label htmlFor="summary" className="text-xs text-muted-foreground">
            Summary
          </Label>
          <Textarea
            id="summary"
            value={metadata.summary}
            onChange={(e) => handleFieldChange("summary", e.target.value)}
            placeholder="Experienced software engineer with expertise in..."
            className="min-h-[100px] resize-none"
          />
        </div>
      </div>
    </div>
  );
}
