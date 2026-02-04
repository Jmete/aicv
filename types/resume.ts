import type { MarginPreset, PageMargins, PaperSize } from "@/lib/resume-defaults";

export interface PageSettings {
  paperSize: PaperSize;
  margins: PageMargins;
  marginPreset: MarginPreset;
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
  description: string;
  technologies: string[];
  bullets: string[];
}

export interface EducationEntry {
  id: string;
  institution: string;
  degree: string;
  field: string;
  graduationDate: string;
  gpa?: string;
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

export interface SectionVisibility {
  summary: boolean;
  experience: boolean;
  projects: boolean;
  education: boolean;
  skills: boolean;
}

export interface ResumeData {
  pageSettings: PageSettings;
  metadata: ResumeMetadata;
  sectionVisibility: SectionVisibility;
  coverLetter: CoverLetterData;
  experience: ExperienceEntry[];
  projects: ProjectEntry[];
  education: EducationEntry[];
  skills: SkillEntry[];
}
