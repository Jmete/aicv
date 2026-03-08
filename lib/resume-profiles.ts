import { createId } from "@/lib/id";
import { normalizeFontFamily } from "@/lib/font-options";
import { DEFAULT_LAYOUT_PREFERENCES, DEFAULT_RESUME_DATA } from "@/lib/resume-defaults";
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
      const aboutMe =
        typeof resumeDataCandidate.aboutMe === "string"
          ? resumeDataCandidate.aboutMe
          : "";
      const layoutPreferences: Record<string, unknown> = isObject(
        resumeDataCandidate.layoutPreferences
      )
        ? resumeDataCandidate.layoutPreferences
        : {};
      const fontPreferences = isObject(layoutPreferences.fontPreferences)
        ? layoutPreferences.fontPreferences
        : {};
      const coverLetterFontPreferences = isObject(
        layoutPreferences.coverLetterFontPreferences
      )
        ? layoutPreferences.coverLetterFontPreferences
        : {};
      return {
        id: resolveProfileId(entry.id),
        name: resolveProfileName(entry.name, index),
        resumeData: cloneValue({
          ...resumeDataCandidate,
          aboutMe,
          layoutPreferences: {
            ...layoutPreferences,
            fontPreferences: {
              ...fontPreferences,
              family: normalizeFontFamily(
                fontPreferences.family,
                DEFAULT_LAYOUT_PREFERENCES.fontPreferences.family
              ),
            },
            coverLetterFontPreferences: {
              ...coverLetterFontPreferences,
              family: normalizeFontFamily(
                coverLetterFontPreferences.family,
                DEFAULT_LAYOUT_PREFERENCES.coverLetterFontPreferences.family
              ),
            },
          },
        }),
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
  if (section === "info") {
    return {
      metadata: data.metadata,
      aboutMe: data.aboutMe,
      hyperlinks: (data.hyperlinks ?? []).filter(
        (hyperlink) => getHyperlinkSection(hyperlink.path) === "info"
      ),
    };
  }
  if (section === "work") {
    return {
      experience: data.experience,
      hyperlinks: (data.hyperlinks ?? []).filter(
        (hyperlink) => getHyperlinkSection(hyperlink.path) === "work"
      ),
    };
  }
  if (section === "projects") {
    return {
      projects: data.projects,
      hyperlinks: (data.hyperlinks ?? []).filter(
        (hyperlink) => getHyperlinkSection(hyperlink.path) === "projects"
      ),
    };
  }
  if (section === "education") {
    return {
      education: data.education,
      hyperlinks: (data.hyperlinks ?? []).filter(
        (hyperlink) => getHyperlinkSection(hyperlink.path) === "education"
      ),
    };
  }
  if (section === "skills") {
    return {
      skills: data.skills,
      hyperlinks: (data.hyperlinks ?? []).filter(
        (hyperlink) => getHyperlinkSection(hyperlink.path) === "skills"
      ),
    };
  }
  return {
    coverLetter: data.coverLetter,
    hyperlinks: (data.hyperlinks ?? []).filter(
      (hyperlink) => getHyperlinkSection(hyperlink.path) === "coverLetter"
    ),
  };
};

const getHyperlinkSection = (
  path: string
): ResumeSyncSection | null => {
  if (path.startsWith("metadata.") || path === "aboutMe") return "info";
  if (path.startsWith("experience[")) return "work";
  if (path.startsWith("projects[")) return "projects";
  if (path.startsWith("education[")) return "education";
  if (path.startsWith("skills[")) return "skills";
  if (path.startsWith("coverLetter.")) return "coverLetter";
  return null;
};

const mergeSectionHyperlinks = (
  target: ResumeData,
  source: ResumeData,
  section: ResumeSyncSection
) => {
  const targetHyperlinks = Array.isArray(target.hyperlinks) ? target.hyperlinks : [];
  const sourceHyperlinks = Array.isArray(source.hyperlinks) ? source.hyperlinks : [];

  return [
    ...targetHyperlinks.filter(
      (hyperlink) => getHyperlinkSection(hyperlink.path) !== section
    ),
    ...sourceHyperlinks.filter(
      (hyperlink) => getHyperlinkSection(hyperlink.path) === section
    ),
  ];
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
    return {
      ...target,
      metadata: cloneValue(source.metadata),
      aboutMe: source.aboutMe,
      hyperlinks: mergeSectionHyperlinks(target, source, section),
    };
  }
  if (section === "work") {
    return {
      ...target,
      experience: cloneValue(source.experience),
      hyperlinks: mergeSectionHyperlinks(target, source, section),
    };
  }
  if (section === "projects") {
    return {
      ...target,
      projects: cloneValue(source.projects),
      hyperlinks: mergeSectionHyperlinks(target, source, section),
    };
  }
  if (section === "education") {
    return {
      ...target,
      education: cloneValue(source.education),
      hyperlinks: mergeSectionHyperlinks(target, source, section),
    };
  }
  if (section === "skills") {
    return {
      ...target,
      skills: cloneValue(source.skills),
      hyperlinks: mergeSectionHyperlinks(target, source, section),
    };
  }
  return {
    ...target,
    coverLetter: cloneValue(source.coverLetter),
    hyperlinks: mergeSectionHyperlinks(target, source, section),
  };
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
