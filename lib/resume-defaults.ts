export type PaperSize = "a4" | "letter";
export type ContactFieldKey =
  | "email"
  | "phone"
  | "location"
  | "linkedin"
  | "website"
  | "github";

export const PAPER_DIMENSIONS: Record<PaperSize, { width: number; height: number }> = {
  a4: { width: 210, height: 297 },
  letter: { width: 215.9, height: 279.4 },
};

export interface PageMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type MarginPreset = "narrow" | "normal" | "moderate";

export const MARGIN_PRESETS: Record<MarginPreset, PageMargins> = {
  narrow: { top: 12.7, right: 12.7, bottom: 12.7, left: 12.7 },
  normal: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
  moderate: { top: 20, right: 20, bottom: 20, left: 20 },
};

export const DEFAULT_MARGINS: PageMargins = MARGIN_PRESETS.moderate;

export const DEFAULT_PAGE_SETTINGS = {
  paperSize: "letter" as PaperSize,
  margins: DEFAULT_MARGINS,
  marginPreset: "moderate" as MarginPreset,
};

export const DEFAULT_SECTION_VISIBILITY = {
  summary: true,
  experience: true,
  projects: true,
  education: true,
  skills: true,
};

export const DEFAULT_HEADER_ALIGNMENT = {
  name: "center",
  subtitle: "center",
  contact: "center",
} as const;

export const DEFAULT_CONTACT_ORDER: ContactFieldKey[] = [
  "email",
  "phone",
  "location",
  "linkedin",
  "website",
  "github",
];

export const DEFAULT_LAYOUT_PREFERENCES: {
  experienceOrder: "title-first" | "company-first";
  educationOrder: "degree-first" | "institution-first";
  sectionOrder: ("summary" | "experience" | "projects" | "education" | "skills")[];
  contactOrder: ContactFieldKey[];
  headerAlignment: {
    name: "left" | "center" | "right";
    subtitle: "left" | "center" | "right";
    contact: "left" | "center" | "right";
  };
} = {
  experienceOrder: "title-first",
  educationOrder: "degree-first",
  sectionOrder: ["summary", "experience", "projects", "education", "skills"],
  contactOrder: DEFAULT_CONTACT_ORDER,
  headerAlignment: DEFAULT_HEADER_ALIGNMENT,
};

export const DEFAULT_COVER_LETTER = {
  date: "",
  hiringManager: "",
  companyAddress: "",
  body: "",
  sendoff: "Best Regards,",
};

export const DEFAULT_RESUME_DATA = {
  pageSettings: DEFAULT_PAGE_SETTINGS,
  metadata: {
    fullName: "",
    subtitle: "",
    contactInfo: {
      email: "",
      phone: "",
      location: "",
      linkedin: "",
      website: "",
      github: "",
    },
    summary: "",
  },
  sectionVisibility: DEFAULT_SECTION_VISIBILITY,
  layoutPreferences: DEFAULT_LAYOUT_PREFERENCES,
  coverLetter: DEFAULT_COVER_LETTER,
  experience: [],
  projects: [],
  education: [],
  skills: [],
};
