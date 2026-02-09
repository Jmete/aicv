import type {
  ContactFieldKey,
  MarginPreset,
  PageMargins,
  PaperSize,
} from "@/lib/resume-defaults";

export type { ContactFieldKey };

export interface PageSettings {
  paperSize: PaperSize;
  resumeMargins: PageMargins;
  resumeMarginPreset: MarginPreset;
  coverLetterMargins: PageMargins;
  coverLetterMarginPreset: MarginPreset;
  // Legacy shared margin fields used by older saved data.
  margins?: PageMargins;
  marginPreset?: MarginPreset;
}

export interface ContactInfo {
  email: string;
  phone: string;
  location: string;
  linkedin?: string;
  website?: string;
  github?: string;
}

export interface ResumeMetadata {
  fullName: string;
  subtitle: string;
  contactInfo: ContactInfo;
  summary: string;
}

export interface ExperienceEntry {
  id: string;
  company: string;
  jobTitle: string;
  location: string;
  startDate: string;
  endDate: string;
  bullets: string[];
}

export interface ProjectEntry {
  id: string;
  name: string;
  technologies: string[];
  bullets: string[];
}

export interface EducationEntry {
  id: string;
  degree: string;
  institution?: string;
  location?: string;
  field?: string;
  graduationDate?: string;
  gpa?: string;
  other?: string;
}

export type ExperienceOrder = "title-first" | "company-first";
export type EducationOrder = "degree-first" | "institution-first";
export type TextAlignment = "left" | "center" | "right";
export type FontFamily = "serif" | "sans" | "mono";

export interface FontSizeSettings {
  name: number;
  subtitle: number;
  contact: number;
  sectionTitle: number;
  itemTitle: number;
  itemDetail: number;
  itemMeta: number;
  body: number;
}

export interface FontPreferences {
  family: FontFamily;
  sizes: FontSizeSettings;
}

export interface HeaderAlignment {
  name: TextAlignment;
  subtitle: TextAlignment;
  contact: TextAlignment;
}

export interface SectionVisibility {
  summary: boolean;
  experience: boolean;
  projects: boolean;
  education: boolean;
  skills: boolean;
}

export type SectionKey = keyof SectionVisibility;

export interface LayoutPreferences {
  experienceOrder: ExperienceOrder;
  educationOrder: EducationOrder;
  sectionOrder: SectionKey[];
  contactOrder: ContactFieldKey[];
  headerAlignment: HeaderAlignment;
  fontPreferences: FontPreferences;
  coverLetterFontPreferences: FontPreferences;
  hyperlinkUnderline: boolean;
}

export interface SkillEntry {
  id: string;
  name: string;
  category: string;
}

export interface CoverLetterData {
  date: string;
  hiringManager: string;
  companyAddress: string;
  body: string;
  sendoff: string;
}

export interface TextHyperlink {
  id: string;
  path: string;
  start: number;
  end: number;
  text: string;
  url: string;
}

export interface ResumeData {
  pageSettings: PageSettings;
  metadata: ResumeMetadata;
  sectionVisibility: SectionVisibility;
  layoutPreferences: LayoutPreferences;
  coverLetter: CoverLetterData;
  experience: ExperienceEntry[];
  projects: ProjectEntry[];
  education: EducationEntry[];
  skills: SkillEntry[];
  hyperlinks?: TextHyperlink[];
}

export type ResumeSyncSection =
  | "layout"
  | "info"
  | "work"
  | "projects"
  | "education"
  | "skills"
  | "coverLetter";

export interface ResumeProfile {
  id: string;
  name: string;
  resumeData: ResumeData;
}

export interface ResumeProfileSyncSettings {
  autoSync: Record<ResumeSyncSection, boolean>;
}

export interface ResumeProfilesData {
  version: 1;
  selectedProfileId: string;
  profiles: ResumeProfile[];
  syncSettings: ResumeProfileSyncSettings;
}
