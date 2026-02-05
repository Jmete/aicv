import type { ResumeData } from "@/types";
import type { ResumeImportContent } from "@/types";

const PATH_REGEX = /([^[.\]]+)|\[(\d+)\]/g;

export type PathSegment = string | number;

export const parseFieldPath = (path: string): PathSegment[] => {
  const segments: PathSegment[] = [];
  let match: RegExpExecArray | null;
  while ((match = PATH_REGEX.exec(path))) {
    if (match[1]) {
      segments.push(match[1]);
    } else if (match[2]) {
      segments.push(Number(match[2]));
    }
  }
  return segments;
};

export const setResumeValueAtPath = (
  data: ResumeData,
  path: string,
  value: string
): ResumeData => {
  const segments = parseFieldPath(path);
  if (segments.length === 0) return data;

  const next = structuredClone(data);
  let cursor: any = next;

  for (let i = 0; i < segments.length - 1; i += 1) {
    const key = segments[i];
    if (cursor == null) return data;
    cursor = cursor[key as keyof typeof cursor];
  }

  const last = segments[segments.length - 1];
  if (cursor == null) return data;
  cursor[last as keyof typeof cursor] = value;

  return next;
};

const safeString = (value: unknown) =>
  typeof value === "string" ? value : "";

const safeStringArray = (value: unknown) =>
  Array.isArray(value) ? value.map((item) => safeString(item)).filter(Boolean) : [];

const ensureContact = (value: ResumeImportContent["metadata"]["contactInfo"]) => ({
  email: safeString(value?.email),
  phone: safeString(value?.phone),
  location: safeString(value?.location),
  linkedin: safeString(value?.linkedin),
  website: safeString(value?.website),
  github: safeString(value?.github),
});

const createId = () => (typeof crypto !== "undefined" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

export const buildResumeDataFromImport = (
  base: ResumeData,
  content: ResumeImportContent
): ResumeData => {
  const metadata = content?.metadata;
  return {
    ...base,
    metadata: {
      ...base.metadata,
      fullName: safeString(metadata?.fullName),
      subtitle: safeString(metadata?.subtitle),
      summary: safeString(metadata?.summary),
      contactInfo: ensureContact(metadata?.contactInfo),
    },
    experience: (content?.experience ?? []).map((entry) => ({
      id: createId(),
      company: safeString(entry.company),
      jobTitle: safeString(entry.jobTitle),
      location: safeString(entry.location),
      startDate: safeString(entry.startDate),
      endDate: safeString(entry.endDate),
      bullets: safeStringArray(entry.bullets),
    })),
    projects: (content?.projects ?? []).map((project) => ({
      id: createId(),
      name: safeString(project.name),
      description: safeString(project.description),
      technologies: safeStringArray(project.technologies),
      bullets: safeStringArray(project.bullets),
    })),
    education: (content?.education ?? []).map((entry) => ({
      id: createId(),
      degree: safeString(entry.degree),
      institution: safeString(entry.institution),
      location: safeString(entry.location),
      field: safeString(entry.field),
      graduationDate: safeString(entry.graduationDate),
      gpa: safeString(entry.gpa),
    })),
    skills: (content?.skills ?? []).map((skill) => ({
      id: createId(),
      name: safeString(skill.name),
      category: safeString(skill.category),
    })),
  };
};

export const applyReplacementTemplate = (
  template: string,
  inputs: Record<string, string>
) => {
  return template.replace(/{{\s*([\w-]+)\s*}}/g, (_, key: string) => {
    const value = inputs[key];
    return value == null ? "" : value;
  });
};
