export type QualityRating = "good" | "needs improvement";

export interface ImprovementInput {
  key: string;
  label: string;
  placeholder?: string;
}

export interface ImprovementSuggestion {
  id: string;
  issue: string;
  requiresUserInput: boolean;
  requiredInputs: ImprovementInput[];
  recommendedReplacement: string | null;
}

export interface FieldFeedback {
  path: string;
  quality: QualityRating;
  improvementSuggestions: ImprovementSuggestion[];
}

export interface ResumeImportContent {
  metadata: {
    fullName: string;
    subtitle: string;
    contactInfo: {
      email: string;
      phone: string;
      location: string;
      linkedin: string;
      website: string;
      github: string;
    };
    summary: string;
  };
  experience: Array<{
    company: string;
    jobTitle: string;
    location: string;
    startDate: string;
    endDate: string;
    bullets: string[];
  }>;
  projects: Array<{
    name: string;
    description: string;
    technologies: string[];
    bullets: string[];
  }>;
  education: Array<{
    degree: string;
    institution: string;
    location: string;
    field: string;
    graduationDate: string;
    gpa: string;
  }>;
  skills: Array<{
    name: string;
    category: string;
  }>;
}

export interface ResumeImportResult {
  resume: ResumeImportContent;
  fieldFeedback: FieldFeedback[];
}

export interface ResumeAnalysisState extends ResumeImportResult {
  raw: unknown;
}
