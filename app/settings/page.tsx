"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bell,
  ChevronLeft,
  ChevronRight,
  FileText,
  Palette,
  RefreshCw,
  Trash2,
  UserPlus,
} from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import { ResumeViewer } from "@/components/panels/resume-viewer";
import { ResumeEditorPanel } from "@/components/resume-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { createId } from "@/lib/id";
import {
  applySelectedProfileResumeUpdate,
  getSelectedProfile,
  normalizeResumeProfilesData,
  RESUME_SYNC_SECTIONS,
  syncSelectedProfileToAll,
} from "@/lib/resume-profiles";
import { buildResumeDataFromImport, setResumeValueAtPath } from "@/lib/resume-analysis";
import { DEFAULT_RESUME_DATA } from "@/lib/resume-defaults";
import { cn } from "@/lib/utils";
import type {
  FieldFeedback,
  ResumeAnalysisState,
  ResumeData,
  ResumeProfilesData,
  ResumeSyncSection,
} from "@/types";

const cloneResumeData = (data: ResumeData): ResumeData => {
  if (typeof structuredClone === "function") {
    return structuredClone(data);
  }
  return JSON.parse(JSON.stringify(data)) as ResumeData;
};

const getNextProfileName = (profilesData: ResumeProfilesData) => {
  const used = new Set(
    profilesData.profiles.map((profile) => profile.name.trim().toLowerCase())
  );
  let index = profilesData.profiles.length + 1;
  while (used.has(`profile ${index}`)) {
    index += 1;
  }
  return `Profile ${index}`;
};

const settingsOptions = [
  {
    id: "default-resume",
    label: "Default Resume",
    description: "Edit and save the default resume used in the main editor.",
    icon: FileText,
  },
  {
    id: "sync-settings",
    label: "Sync Settings",
    description: "Control what sections auto-sync between profiles.",
    icon: RefreshCw,
  },
  {
    id: "appearance",
    label: "Appearance",
    description: "Theme, typography, and document defaults.",
    icon: Palette,
  },
  {
    id: "notifications",
    label: "Notifications",
    description: "Control alerts and status updates.",
    icon: Bell,
  },
] as const;

type SettingsOptionId = (typeof settingsOptions)[number]["id"];

const initialProfilesData = normalizeResumeProfilesData(DEFAULT_RESUME_DATA);

export default function SettingsPage() {
  const [profilesData, setProfilesData] =
    useState<ResumeProfilesData>(initialProfilesData);
  const [isLoading, setIsLoading] = useState(true);
  const [resumeAnalysis, setResumeAnalysis] =
    useState<ResumeAnalysisState | null>(null);
  const [isImportingResume, setIsImportingResume] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [activeOption, setActiveOption] =
    useState<SettingsOptionId>("default-resume");
  const [mobileDefaultResumeTab, setMobileDefaultResumeTab] = useState<
    "preview" | "edit"
  >("preview");
  const [isDefaultResumeEditorPanelOpen, setIsDefaultResumeEditorPanelOpen] =
    useState(true);

  const selectedProfile = useMemo(
    () => getSelectedProfile(profilesData),
    [profilesData]
  );
  const resumeData = selectedProfile.resumeData;

  const activeOptionData = settingsOptions.find(
    (option) => option.id === activeOption
  );

  const handleResumeUpdate = useCallback((data: ResumeData) => {
    setProfilesData((current) => applySelectedProfileResumeUpdate(current, data));
  }, []);

  const handleImportResume = useCallback(async (file: File) => {
    setIsImportingResume(true);
    setImportError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/resume-import", {
        method: "POST",
        body: formData,
      });
      const rawText = await response.text();
      let payload: any = {};
      if (rawText) {
        try {
          payload = JSON.parse(rawText);
        } catch {
          throw new Error("Import failed. Server returned invalid JSON.");
        }
      }
      if (!response.ok) {
        throw new Error(payload?.error || "Import failed.");
      }

      if (payload?.mode === "resume-data" && payload?.resumeData) {
        const nextResumeData = payload.resumeData as ResumeData;
        setProfilesData((current) =>
          applySelectedProfileResumeUpdate(current, nextResumeData)
        );
        setResumeAnalysis(null);
        return;
      }

      setProfilesData((current) => {
        const selected = getSelectedProfile(current);
        const nextResumeData = buildResumeDataFromImport(
          selected.resumeData,
          payload.resume
        );
        return applySelectedProfileResumeUpdate(current, nextResumeData);
      });
      setResumeAnalysis({
        resume: payload.resume,
        fieldFeedback: payload.fieldFeedback,
        raw: payload.raw ?? payload,
      });
    } catch (error) {
      console.error("Error importing resume:", error);
      setImportError(
        error instanceof Error ? error.message : "Failed to import resume."
      );
    } finally {
      setIsImportingResume(false);
    }
  }, []);

  const handleApplySuggestion = useCallback(
    (path: string, suggestionId: string, replacement: string) => {
      setProfilesData((current) => {
        const selected = getSelectedProfile(current);
        const selectedResumeData = selected.resumeData;

        const nextResumeData = (() => {
          const categoryMatch = path.match(/^skills\[(\d+)\]\.category$/);
          if (categoryMatch) {
            const index = Number(categoryMatch[1]);
            const target = selectedResumeData.skills[index];
            if (!target) return selectedResumeData;
            return {
              ...selectedResumeData,
              skills: selectedResumeData.skills.map((skill) =>
                skill.category === target.category
                  ? { ...skill, category: replacement }
                  : skill
              ),
            };
          }
          return setResumeValueAtPath(selectedResumeData, path, replacement);
        })();

        return applySelectedProfileResumeUpdate(current, nextResumeData);
      });
      setResumeAnalysis((current) => {
        if (!current) return current;
        const nextFeedback: FieldFeedback[] = current.fieldFeedback.map((entry) => {
          if (entry.path !== path) return entry;
          const remaining = entry.improvementSuggestions.filter(
            (suggestion) => suggestion.id !== suggestionId
          );
          if (remaining.length === 0) {
            return { ...entry, quality: "good", improvementSuggestions: [] };
          }
          return { ...entry, improvementSuggestions: remaining };
        });
        return { ...current, fieldFeedback: nextFeedback };
      });
    },
    []
  );

  const handleAddProfile = useCallback(() => {
    setProfilesData((current) => {
      const selected = getSelectedProfile(current);
      const newProfile = {
        id: createId(),
        name: getNextProfileName(current),
        resumeData: cloneResumeData(selected.resumeData),
      };
      return {
        ...current,
        profiles: [...current.profiles, newProfile],
        selectedProfileId: newProfile.id,
      };
    });
    setResumeAnalysis(null);
    setImportError(null);
  }, []);

  const handleDeleteSelectedProfile = useCallback(() => {
    setProfilesData((current) => {
      if (current.profiles.length <= 1) return current;
      const remainingProfiles = current.profiles.filter(
        (profile) => profile.id !== current.selectedProfileId
      );
      const fallbackProfileId =
        remainingProfiles.find((profile) => profile.id !== current.selectedProfileId)
          ?.id ?? remainingProfiles[0]?.id;

      if (!fallbackProfileId) return current;
      return {
        ...current,
        selectedProfileId: fallbackProfileId,
        profiles: remainingProfiles,
      };
    });
    setResumeAnalysis(null);
    setImportError(null);
  }, []);

  const handleSelectedProfileNameChange = useCallback((name: string) => {
    setProfilesData((current) => ({
      ...current,
      profiles: current.profiles.map((profile) =>
        profile.id === current.selectedProfileId ? { ...profile, name } : profile
      ),
    }));
  }, []);

  const handleSelectedProfileNameBlur = useCallback(() => {
    setProfilesData((current) => {
      const selected = getSelectedProfile(current);
      const trimmed = selected.name.trim();
      if (trimmed) {
        if (trimmed === selected.name) return current;
        return {
          ...current,
          profiles: current.profiles.map((profile) =>
            profile.id === selected.id ? { ...profile, name: trimmed } : profile
          ),
        };
      }

      const index =
        current.profiles.findIndex((profile) => profile.id === selected.id) + 1;
      const fallbackName = `Profile ${Math.max(index, 1)}`;
      return {
        ...current,
        profiles: current.profiles.map((profile) =>
          profile.id === selected.id ? { ...profile, name: fallbackName } : profile
        ),
      };
    });
  }, []);

  const handleSyncToAllProfiles = useCallback(() => {
    setProfilesData((current) => syncSelectedProfileToAll(current));
  }, []);

  const handleAutoSyncToggle = useCallback(
    (section: ResumeSyncSection, enabled: boolean) => {
      setProfilesData((current) => ({
        ...current,
        syncSettings: {
          ...current.syncSettings,
          autoSync: {
            ...current.syncSettings.autoSync,
            [section]: enabled,
          },
        },
      }));
    },
    []
  );

  useEffect(() => {
    let isActive = true;

    async function loadResumeData() {
      try {
        const response = await fetch("/api/resume-data?mode=profiles");
        if (!response.ok) return;
        const data = await response.json();
        if (isActive) {
          setProfilesData(normalizeResumeProfilesData(data));
          setResumeAnalysis(null);
          setImportError(null);
          setSaveStatus("saved");
        }
      } catch (error) {
        console.error("Error loading resume data:", error);
        if (isActive) {
          setSaveStatus("error");
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    loadResumeData();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (isLoading) return;
    setSaveStatus("saving");
    const timeout = setTimeout(async () => {
      try {
        const response = await fetch("/api/resume-data?mode=profiles", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(profilesData),
        });
        if (!response.ok) {
          throw new Error("Save failed");
        }
        setSaveStatus("saved");
      } catch (error) {
        console.error("Error saving resume data:", error);
        setSaveStatus("error");
      }
    }, 500);

    return () => clearTimeout(timeout);
  }, [isLoading, profilesData]);

  useEffect(() => {
    setResumeAnalysis(null);
    setImportError(null);
  }, [profilesData.selectedProfileId]);

  const profileControls = (
    <div className="border-b border-border bg-card/30 px-3 py-1.5 md:px-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="min-w-[170px] flex-1 md:max-w-[240px]">
          <Select
            value={profilesData.selectedProfileId}
            onValueChange={(nextProfileId) =>
              setProfilesData((current) => ({
                ...current,
                selectedProfileId: nextProfileId,
              }))
            }
          >
            <SelectTrigger className="h-7 text-[11px]">
              <SelectValue placeholder="Select profile" />
            </SelectTrigger>
            <SelectContent>
              {profilesData.profiles.map((profile) => (
                <SelectItem key={profile.id} value={profile.id}>
                  {profile.name.trim() || "Untitled Profile"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Input
          value={selectedProfile.name}
          onChange={(event) => handleSelectedProfileNameChange(event.target.value)}
          onBlur={handleSelectedProfileNameBlur}
          className="h-7 w-[130px] text-[11px] md:w-[160px]"
          placeholder="Profile name"
          aria-label="Profile name"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleAddProfile}
          aria-label="Add profile"
        >
          <UserPlus className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleDeleteSelectedProfile}
          disabled={profilesData.profiles.length <= 1}
          aria-label="Delete selected profile"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-[11px]"
          onClick={handleSyncToAllProfiles}
          disabled={profilesData.profiles.length <= 1}
        >
          <RefreshCw className="h-3 w-3" />
          Sync
        </Button>
      </div>
    </div>
  );

  const syncSettingsPanel = (
    <ScrollArea className="flex-1">
      <div className="p-4 md:p-8">
        <div className="mx-auto w-full max-w-2xl rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-medium text-foreground">Sync Settings</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Auto-sync keeps enabled sections identical across all profiles whenever
            you edit the selected profile.
          </p>

          <div className="mt-4 space-y-3">
            {RESUME_SYNC_SECTIONS.map((section) => {
              const isEnabled =
                profilesData.syncSettings.autoSync[section.key] ?? false;
              return (
                <div
                  key={section.key}
                  className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-background p-3"
                >
                  <div>
                    <p className="text-xs font-medium text-foreground">
                      {section.label}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {section.description}
                    </p>
                  </div>
                  <Switch
                    checked={isEnabled}
                    onCheckedChange={(checked) =>
                      handleAutoSyncToggle(section.key, checked)
                    }
                    aria-label={`Auto sync ${section.label}`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </ScrollArea>
  );

  const shouldShowSaveStatus =
    activeOption === "default-resume" || activeOption === "sync-settings";

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background pb-20 md:pb-0">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 md:hidden">
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Back to editor</span>
            </Link>
          </Button>
          <h1 className="text-sm font-medium">Settings</h1>
          <p className="hidden text-xs text-muted-foreground md:block">
            {activeOptionData?.description}
          </p>
          {shouldShowSaveStatus && (
            <div
              className={cn(
                "ml-auto text-xs",
                saveStatus === "error"
                  ? "text-destructive"
                  : "text-muted-foreground"
              )}
            >
              {isLoading
                ? "Loading..."
                : saveStatus === "saving"
                  ? "Saving..."
                  : saveStatus === "error"
                    ? "Save failed"
                    : "Saved"}
            </div>
          )}
        </header>

        <div className="border-b border-border md:hidden">
          <ScrollArea className="w-full whitespace-nowrap">
            <div className="flex gap-2 p-2">
              {settingsOptions.map((option) => {
                const Icon = option.icon;
                const isActive = option.id === activeOption;
                return (
                  <Button
                    key={option.id}
                    type="button"
                    variant={isActive ? "secondary" : "ghost"}
                    className="h-8 shrink-0 gap-1.5 px-3 text-xs text-foreground"
                    onClick={() => setActiveOption(option.id)}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {option.label}
                  </Button>
                );
              })}
            </div>
          </ScrollArea>
          <p className="px-3 pb-2 text-xs text-foreground">
            {activeOptionData?.description}
          </p>
        </div>

        <div className="hidden min-w-0 flex-1 overflow-hidden md:flex">
          <div className="flex w-80 shrink-0 flex-col border-r border-border">
            <div className="border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                  <Link href="/">
                    <ArrowLeft className="h-4 w-4" />
                    <span className="sr-only">Back to editor</span>
                  </Link>
                </Button>
                <h1 className="text-sm font-medium">Settings</h1>
                {shouldShowSaveStatus && (
                  <div
                    className={cn(
                      "ml-auto text-[11px]",
                      saveStatus === "error"
                        ? "text-destructive"
                        : "text-muted-foreground"
                    )}
                  >
                    {isLoading
                      ? "Loading..."
                      : saveStatus === "saving"
                        ? "Saving..."
                        : saveStatus === "error"
                          ? "Save failed"
                          : "Saved"}
                  </div>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {activeOptionData?.description}
              </p>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <ul className="space-y-2 p-4">
                {settingsOptions.map((option) => {
                  const Icon = option.icon;
                  const isActive = option.id === activeOption;
                  return (
                    <li key={option.id}>
                      <button
                        type="button"
                        className={cn(
                          "w-full rounded-md border px-3 py-2 text-left transition-colors",
                          isActive
                            ? "border-border bg-accent"
                            : "border-transparent hover:bg-muted"
                        )}
                        onClick={() => setActiveOption(option.id)}
                      >
                        <div className="flex items-start gap-3">
                          <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {option.label}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {option.description}
                            </p>
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
          </div>

          {activeOption === "default-resume" ? (
            <>
              <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                {profileControls}
                <div className="min-h-0 flex-1 overflow-hidden">
                  <ResumeViewer
                    resumeData={resumeData}
                    onResumeUpdate={handleResumeUpdate}
                    analysis={resumeAnalysis}
                    onApplySuggestion={handleApplySuggestion}
                  />
                </div>
              </div>

              <div
                className={cn(
                  "relative shrink-0 border-l border-border transition-[width] duration-200",
                  isDefaultResumeEditorPanelOpen ? "w-[460px]" : "w-11"
                )}
              >
                {isDefaultResumeEditorPanelOpen ? (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute left-2 top-2 z-20 h-7 w-7"
                      onClick={() => setIsDefaultResumeEditorPanelOpen(false)}
                      aria-label="Collapse editor panel"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <ResumeEditorPanel
                      resumeData={resumeData}
                      onResumeUpdate={handleResumeUpdate}
                      onImportResume={handleImportResume}
                      isImportingResume={isImportingResume}
                      importError={importError}
                    />
                  </>
                ) : (
                  <div className="flex h-full items-start justify-center pt-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setIsDefaultResumeEditorPanelOpen(true)}
                      aria-label="Open editor panel"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </>
          ) : activeOption === "sync-settings" ? (
            <div className="flex flex-1 flex-col overflow-hidden">{syncSettingsPanel}</div>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8">
              <div className="max-w-md rounded-lg border border-border bg-card p-6">
                <h2 className="text-sm font-medium text-foreground">
                  {activeOptionData?.label}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  This section is available in the menu and can be expanded next.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:hidden">
          {activeOption === "default-resume" ? (
            <>
              {profileControls}
              <div className="border-b border-border bg-card/40 p-2">
                <div className="grid grid-cols-2 gap-1 rounded-lg border border-border/70 bg-muted/30 p-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={
                      mobileDefaultResumeTab === "preview" ? "secondary" : "ghost"
                    }
                    className="h-8 text-xs text-foreground"
                    onClick={() => setMobileDefaultResumeTab("preview")}
                  >
                    Preview
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={
                      mobileDefaultResumeTab === "edit" ? "secondary" : "ghost"
                    }
                    className="h-8 text-xs text-foreground"
                    onClick={() => setMobileDefaultResumeTab("edit")}
                  >
                    Edit
                  </Button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden">
                {mobileDefaultResumeTab === "preview" ? (
                  <ResumeViewer
                    resumeData={resumeData}
                    onResumeUpdate={handleResumeUpdate}
                    analysis={resumeAnalysis}
                    onApplySuggestion={handleApplySuggestion}
                  />
                ) : (
                  <ResumeEditorPanel
                    resumeData={resumeData}
                    onResumeUpdate={handleResumeUpdate}
                    onImportResume={handleImportResume}
                    isImportingResume={isImportingResume}
                    importError={importError}
                  />
                )}
              </div>
            </>
          ) : activeOption === "sync-settings" ? (
            syncSettingsPanel
          ) : (
            <ScrollArea className="flex-1">
              <div className="p-4">
                <div className="rounded-lg border border-border bg-card p-5">
                  <h2 className="text-sm font-medium text-foreground">
                    {activeOptionData?.label}
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    This section is available in the menu and can be expanded next.
                  </p>
                </div>
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    </div>
  );
}
