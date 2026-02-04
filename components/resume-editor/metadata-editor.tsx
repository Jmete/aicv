"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type {
  ContactFieldKey,
  HeaderAlignment,
  ResumeMetadata,
  TextAlignment,
} from "@/types";
import { AlignCenter, AlignLeft, AlignRight, GripVertical } from "lucide-react";

const CONTACT_FIELDS = [
  {
    key: "email",
    label: "Email",
    placeholder: "john@example.com",
    type: "email",
    group: "contact",
  },
  {
    key: "phone",
    label: "Phone",
    placeholder: "(555) 123-4567",
    type: "tel",
    group: "contact",
  },
  {
    key: "location",
    label: "Location",
    placeholder: "San Francisco, CA",
    type: "text",
    group: "contact",
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    placeholder: "linkedin.com/in/johndoe",
    type: "url",
    group: "profile",
  },
  {
    key: "website",
    label: "Website",
    placeholder: "johndoe.com",
    type: "url",
    group: "profile",
  },
  {
    key: "github",
    label: "GitHub",
    placeholder: "github.com/johndoe",
    type: "url",
    group: "profile",
  },
] as const;

type ContactFieldConfig = (typeof CONTACT_FIELDS)[number];
type ContactGroup = ContactFieldConfig["group"];

interface MetadataEditorProps {
  metadata: ResumeMetadata;
  headerAlignment: HeaderAlignment;
  contactOrder: ContactFieldKey[];
  onChange: (metadata: ResumeMetadata) => void;
  onContactOrderChange: (order: ContactFieldKey[]) => void;
  onHeaderAlignmentChange: (alignment: HeaderAlignment) => void;
}

export function MetadataEditor({
  metadata,
  headerAlignment,
  contactOrder,
  onChange,
  onContactOrderChange,
  onHeaderAlignmentChange,
}: MetadataEditorProps) {
  const [dragging, setDragging] = useState<ContactFieldKey | null>(null);

  const orderedContactFields = useMemo(() => {
    const fallback = CONTACT_FIELDS.map((field) => field.key);
    const seen = new Set<ContactFieldKey>();
    return [...contactOrder, ...fallback].filter((key) => {
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [contactOrder]);

  const contactFieldMap = useMemo(() => {
    return CONTACT_FIELDS.reduce(
      (acc, field) => {
        acc[field.key] = field;
        return acc;
      },
      {} as Record<ContactFieldKey, ContactFieldConfig>
    );
  }, []);

  const handleFieldChange = (field: keyof ResumeMetadata, value: string) => {
    onChange({
      ...metadata,
      [field]: value,
    });
  };

  const handleContactChange = (
    field: ContactFieldKey,
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

  const updateAlignment = (
    field: keyof HeaderAlignment,
    value: TextAlignment
  ) => {
    onHeaderAlignmentChange({
      ...headerAlignment,
      [field]: value,
    });
  };

  const handleContactDrop = (target: ContactFieldKey) => {
    if (!dragging || dragging === target) return;
    const next = orderedContactFields.filter((key) => key !== dragging);
    const targetIndex = next.indexOf(target);
    next.splice(targetIndex, 0, dragging);
    onContactOrderChange(next);
    setDragging(null);
  };

  const AlignmentRow = ({
    label,
    value,
    onValueChange,
  }: {
    label: string;
    value: TextAlignment;
    onValueChange: (value: TextAlignment) => void;
  }) => (
    <div className="flex items-center justify-between gap-3">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(nextValue) => {
          if (!nextValue) return;
          onValueChange(nextValue as TextAlignment);
        }}
        variant="outline"
        size="sm"
        className="justify-end"
        aria-label={`${label} alignment`}
      >
        <ToggleGroupItem value="left" className="h-7 px-2 text-[11px]">
          <AlignLeft className="h-3.5 w-3.5" />
          Left
        </ToggleGroupItem>
        <ToggleGroupItem value="center" className="h-7 px-2 text-[11px]">
          <AlignCenter className="h-3.5 w-3.5" />
          Center
        </ToggleGroupItem>
        <ToggleGroupItem value="right" className="h-7 px-2 text-[11px]">
          <AlignRight className="h-3.5 w-3.5" />
          Right
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );

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

          <p className="text-xs text-muted-foreground">
            Drag rows to reorder how contact details appear in the header.
          </p>

          <div className="space-y-3">
            {(() => {
              const renderedGroups = new Set<ContactGroup>();
              return orderedContactFields.map((key) => {
                const field = contactFieldMap[key];
                if (!field) return null;
                const showGroupHeading = !renderedGroups.has(field.group);
                if (showGroupHeading) {
                  renderedGroups.add(field.group);
                }
                return (
                  <div key={key} className="space-y-3">
                    {showGroupHeading && (
                      <div className="pt-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {field.group === "contact"
                            ? "Contact Information"
                            : "Online Profiles"}
                        </p>
                      </div>
                    )}
                    <div
                      className="flex items-start gap-2 rounded-md border border-transparent px-1.5 py-1 transition-colors hover:border-border"
                      draggable
                      onDragStart={(event) => {
                        setDragging(key);
                        event.dataTransfer.effectAllowed = "move";
                      }}
                      onDragOver={(event) => event.preventDefault()}
                      onDragEnd={() => setDragging(null)}
                      onDrop={() => handleContactDrop(key)}
                    >
                      <div className="pt-2 cursor-grab">
                        <GripVertical className="h-4 w-4 text-muted-foreground/70" />
                      </div>
                      <div className="flex-1 space-y-2">
                        <Label
                          htmlFor={key}
                          className="text-xs text-muted-foreground"
                        >
                          {field.label}
                        </Label>
                        <Input
                          id={key}
                          type={field.type}
                          value={metadata.contactInfo[key] ?? ""}
                          onChange={(e) =>
                            handleContactChange(key, e.target.value)
                          }
                          placeholder={field.placeholder}
                          className="h-9"
                        />
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      </div>

      <div className="space-y-4 rounded-lg border border-border bg-card p-4">
        <div className="space-y-1">
          <h3 className="text-sm font-medium text-foreground">
            Header Alignment
          </h3>
          <p className="text-xs text-muted-foreground">
            Align each line at the top of your resume.
          </p>
        </div>

        <div className="space-y-3">
          <AlignmentRow
            label="Name"
            value={headerAlignment.name}
            onValueChange={(value) => updateAlignment("name", value)}
          />
          <AlignmentRow
            label="Subtitle"
            value={headerAlignment.subtitle}
            onValueChange={(value) => updateAlignment("subtitle", value)}
          />
          <AlignmentRow
            label="Contact"
            value={headerAlignment.contact}
            onValueChange={(value) => updateAlignment("contact", value)}
          />
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
