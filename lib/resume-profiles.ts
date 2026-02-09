import { createId } from "@/lib/id";
import { DEFAULT_RESUME_DATA } from "@/lib/resume-defaults";
import type {
  ResumeData,
  ResumeProfile,
  ResumeProfilesData,
  ResumeSyncSection,
} from "@/types";

const cloneValue = <T>(value: T): T => {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isLikelyResumeData = (value: unknown): value is ResumeData => {
  if (!isObject(value)) return false;
  return (
    "metadata" in value &&
    "layoutPreferences" in value &&
    "experience" in value &&
    "projects" in value
  );
};

const resolveProfileName = (value: unknown, index: number) => {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return `Profile ${index + 1}`;
};

const resolveProfileId = (value: unknown) => {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return createId();
};

export const RESUME_SYNC_SECTIONS: {
  key: ResumeSyncSection;
  label: string;
  description: string;
}[] = [
  {
    key: "layout",
    label: "Layout",
    description: "Paper size, margins, ordering, visibility, and typography.",
  },
  {
    key: "info",
    label: "Info",
    description: "Name, contact details, title, and summary.",
  },
  {
    key: "work",
    label: "Work",
    description: "Experience entries.",
  },
  {
    key: "projects",
    label: "Projects",
    description: "Project entries.",
  },
  {
    key: "education",
    label: "Education",
    description: "Education entries.",
  },
  {
    key: "skills",
    label: "Skills",
    description: "Skills and categories.",
  },
  {
    key: "coverLetter",
    label: "Cover Letter",
    description: "Cover letter content and addressing fields.",
  },
];

export const DEFAULT_RESUME_SYNC_SETTINGS: Record<ResumeSyncSection, boolean> = {
  layout: false,
  info: true,
  work: true,
  projects: true,
  education: true,
  skills: true,
  coverLetter: true,
};

const createDefaultProfile = (resumeData: ResumeData): ResumeProfile => ({
  id: createId(),
  name: "Default Profile",
  resumeData: cloneValue(resumeData),
});

export const createDefaultResumeProfilesData = (
  resumeData: ResumeData = DEFAULT_RESUME_DATA
): ResumeProfilesData => {
  const profile = createDefaultProfile(resumeData);
  return {
    version: 1,
    selectedProfileId: profile.id,
    profiles: [profile],
    syncSettings: {
      autoSync: { ...DEFAULT_RESUME_SYNC_SETTINGS },
    },
  };
};

const normalizeProfiles = (value: unknown): ResumeProfile[] => {
  if (!Array.isArray(value)) return [];
  const profiles: ResumeProfile[] = value
    .map((entry, index) => {
      if (!isObject(entry)) return null;
      const resumeDataCandidate = entry.resumeData;
      if (!isLikelyResumeData(resumeDataCandidate)) return null;
      return {
        id: resolveProfileId(entry.id),
        name: resolveProfileName(entry.name, index),
        resumeData: cloneValue(resumeDataCandidate),
      };
    })
    .filter((profile): profile is ResumeProfile => profile !== null);

  const seenIds = new Set<string>();
  return profiles.map((profile) => {
    let id = profile.id;
    while (seenIds.has(id)) {
      id = createId();
    }
    seenIds.add(id);
    return id === profile.id ? profile : { ...profile, id };
  });
};

const normalizeSyncSettings = (value: unknown): Record<ResumeSyncSection, boolean> => {
  if (!isObject(value)) {
    return { ...DEFAULT_RESUME_SYNC_SETTINGS };
  }

  const autoSyncRaw = isObject(value.autoSync) ? value.autoSync : {};
  return RESUME_SYNC_SECTIONS.reduce(
    (accumulator, section) => ({
      ...accumulator,
      [section.key]:
        typeof autoSyncRaw[section.key] === "boolean"
          ? (autoSyncRaw[section.key] as boolean)
          : DEFAULT_RESUME_SYNC_SETTINGS[section.key],
    }),
    {} as Record<ResumeSyncSection, boolean>
  );
};

export const normalizeResumeProfilesData = (
  value: unknown
): ResumeProfilesData => {
  if (isLikelyResumeData(value)) {
    return createDefaultResumeProfilesData(value);
  }

  if (!isObject(value)) {
    return createDefaultResumeProfilesData();
  }

  const profiles = normalizeProfiles(value.profiles);
  if (!profiles.length) {
    return createDefaultResumeProfilesData();
  }

  const selectedProfileIdRaw = value.selectedProfileId;
  const selectedProfileId =
    typeof selectedProfileIdRaw === "string" &&
    profiles.some((profile) => profile.id === selectedProfileIdRaw)
      ? selectedProfileIdRaw
      : profiles[0].id;

  return {
    version: 1,
    selectedProfileId,
    profiles,
    syncSettings: {
      autoSync: normalizeSyncSettings(value.syncSettings),
    },
  };
};

export const getSelectedProfile = (
  profilesData: ResumeProfilesData
): ResumeProfile => {
  const profile = profilesData.profiles.find(
    (candidate) => candidate.id === profilesData.selectedProfileId
  );
  return profile ?? profilesData.profiles[0];
};

export const getSelectedResumeData = (
  profilesData: ResumeProfilesData
): ResumeData => {
  return cloneValue(getSelectedProfile(profilesData).resumeData);
};

const getSectionValue = (data: ResumeData, section: ResumeSyncSection) => {
  if (section === "layout") {
    return {
      pageSettings: data.pageSettings,
      sectionVisibility: data.sectionVisibility,
      layoutPreferences: data.layoutPreferences,
    };
  }
  if (section === "info") return data.metadata;
  if (section === "work") return data.experience;
  if (section === "projects") return data.projects;
  if (section === "education") return data.education;
  if (section === "skills") return data.skills;
  return data.coverLetter;
};

const sectionsDiffer = (
  previousData: ResumeData,
  nextData: ResumeData,
  section: ResumeSyncSection
) => {
  return (
    JSON.stringify(getSectionValue(previousData, section)) !==
    JSON.stringify(getSectionValue(nextData, section))
  );
};

const applySection = (
  target: ResumeData,
  source: ResumeData,
  section: ResumeSyncSection
): ResumeData => {
  if (section === "layout") {
    return {
      ...target,
      pageSettings: cloneValue(source.pageSettings),
      sectionVisibility: cloneValue(source.sectionVisibility),
      layoutPreferences: cloneValue(source.layoutPreferences),
    };
  }
  if (section === "info") {
    return { ...target, metadata: cloneValue(source.metadata) };
  }
  if (section === "work") {
    return { ...target, experience: cloneValue(source.experience) };
  }
  if (section === "projects") {
    return { ...target, projects: cloneValue(source.projects) };
  }
  if (section === "education") {
    return { ...target, education: cloneValue(source.education) };
  }
  if (section === "skills") {
    return { ...target, skills: cloneValue(source.skills) };
  }
  return { ...target, coverLetter: cloneValue(source.coverLetter) };
};

export const applySelectedProfileResumeUpdate = (
  profilesData: ResumeProfilesData,
  nextSelectedResumeData: ResumeData
): ResumeProfilesData => {
  const selectedProfile = getSelectedProfile(profilesData);
  const changedSections = RESUME_SYNC_SECTIONS.filter((section) =>
    sectionsDiffer(selectedProfile.resumeData, nextSelectedResumeData, section.key)
  )
    .map((section) => section.key)
    .filter((section) => profilesData.syncSettings.autoSync[section]);

  const nextProfiles = profilesData.profiles.map((profile) => {
    if (profile.id === selectedProfile.id) {
      return {
        ...profile,
        resumeData: cloneValue(nextSelectedResumeData),
      };
    }

    if (!changedSections.length) return profile;

    const syncedResumeData = changedSections.reduce(
      (accumulator, section) =>
        applySection(accumulator, nextSelectedResumeData, section),
      profile.resumeData
    );
    return {
      ...profile,
      resumeData: syncedResumeData,
    };
  });

  return {
    ...profilesData,
    profiles: nextProfiles,
  };
};

export const syncSelectedProfileToAll = (
  profilesData: ResumeProfilesData
): ResumeProfilesData => {
  const selectedProfile = getSelectedProfile(profilesData);
  const sourceResumeData = selectedProfile.resumeData;

  return {
    ...profilesData,
    profiles: profilesData.profiles.map((profile) => ({
      ...profile,
      resumeData: cloneValue(sourceResumeData),
    })),
  };
};
