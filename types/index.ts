export interface Skill {
  id: number;
  name: string;
  category: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Application {
  id: number;
  companyName: string;
  jobTitle: string;
  jobUrl: string | null;
  jobDescription: string;
  status: "draft" | "applied" | "interviewing" | "offered" | "rejected";
  resumeContent: string | null;
  coverLetterContent: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApplicationSkill {
  id: number;
  applicationId: number;
  skillId: number;
  relevanceScore: number;
  isSelected: boolean;
}

export type ApplicationStatus = Application["status"];

export * from "./resume";
export * from "./resume-analysis";
