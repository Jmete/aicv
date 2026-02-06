import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { z } from "zod";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import type { ResumeImportContent } from "@/types";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
let pdfWorkerConfigured = false;

const ensurePdfWorker = () => {
  if (pdfWorkerConfigured) return;
  const workerPath = path.join(
    process.cwd(),
    "node_modules",
    "pdf-parse",
    "dist",
    "worker",
    "pdf.worker.mjs"
  );
  PDFParse.setWorker(pathToFileURL(workerPath).toString());
  pdfWorkerConfigured = true;
};

const resumeImportSchema = z.object({
  resume: z.object({
    metadata: z.object({
      fullName: z.string(),
      subtitle: z.string(),
      contactInfo: z.object({
        email: z.string(),
        phone: z.string(),
        location: z.string(),
        linkedin: z.string(),
        website: z.string(),
        github: z.string(),
      }),
      summary: z.string(),
    }),
    experience: z.array(
      z.object({
        company: z.string(),
        jobTitle: z.string(),
        location: z.string(),
        startDate: z.string(),
        endDate: z.string(),
        bullets: z.array(z.string()),
      })
    ),
    projects: z.array(
      z.object({
        name: z.string(),
        technologies: z.array(z.string()),
        bullets: z.array(z.string()),
      })
    ),
    education: z.array(
      z.object({
        degree: z.string(),
        institution: z.string(),
        location: z.string(),
        field: z.string(),
        graduationDate: z.string(),
        gpa: z.string(),
      })
    ),
    skills: z.array(
      z.object({
        name: z.string(),
        category: z.string(),
      })
    ),
  }),
  fieldFeedback: z.array(
    z.object({
      path: z.string(),
      quality: z.enum(["good", "needs improvement"]),
      improvementSuggestions: z.array(
        z.object({
          id: z.string(),
          issue: z.string(),
          requiresUserInput: z.boolean(),
          requiredInputs: z.array(
            z.object({
              key: z.string(),
              label: z.string(),
              placeholder: z.string(),
            })
          ),
          recommendedReplacement: z.string().nullable(),
        })
      ),
    })
  ),
});

const sanitizeText = (value: string) =>
  value.replace(/\u0000/g, "").replace(/\r\n/g, "\n").trim();

const buildAllPaths = (resume: ResumeImportContent) => {
  const paths: string[] = [
    "metadata.fullName",
    "metadata.subtitle",
    "metadata.contactInfo.email",
    "metadata.contactInfo.phone",
    "metadata.contactInfo.location",
    "metadata.contactInfo.linkedin",
    "metadata.contactInfo.website",
    "metadata.contactInfo.github",
    "metadata.summary",
  ];

  resume.experience.forEach((entry, i) => {
    paths.push(
      `experience[${i}].company`,
      `experience[${i}].jobTitle`,
      `experience[${i}].location`,
      `experience[${i}].startDate`,
      `experience[${i}].endDate`
    );
    entry.bullets.forEach((_, j) =>
      paths.push(`experience[${i}].bullets[${j}]`)
    );
  });

  resume.projects.forEach((project, i) => {
    paths.push(`projects[${i}].name`);
    project.technologies.forEach((_, j) =>
      paths.push(`projects[${i}].technologies[${j}]`)
    );
    project.bullets.forEach((_, j) =>
      paths.push(`projects[${i}].bullets[${j}]`)
    );
  });

  resume.education.forEach((entry, i) => {
    paths.push(
      `education[${i}].degree`,
      `education[${i}].institution`,
      `education[${i}].location`,
      `education[${i}].field`,
      `education[${i}].graduationDate`,
      `education[${i}].gpa`
    );
  });

  resume.skills.forEach((_, i) => {
    paths.push(`skills[${i}].name`, `skills[${i}].category`);
  });

  return paths;
};

const ensureFeedbackCoverage = (
  resume: ResumeImportContent,
  fieldFeedback: z.infer<typeof resumeImportSchema>["fieldFeedback"]
) => {
  const feedbackMap = new Map(fieldFeedback.map((entry) => [entry.path, entry]));
  return buildAllPaths(resume).map((path) => {
    const entry = feedbackMap.get(path);
    if (!entry) {
      return {
        path,
        quality: "good" as const,
        improvementSuggestions: [],
      };
    }
    return {
      ...entry,
      quality:
        entry.quality === "needs improvement" ? "needs improvement" : "good",
      improvementSuggestions: entry.improvementSuggestions ?? [],
    };
  });
};

const getPrompt = async () => {
  const filePath = path.join(process.cwd(), "lib", "prompts", "resume-import.md");
  return readFile(filePath, "utf8");
};

const extractText = async (
  buffer: Buffer,
  extension: string
): Promise<string> => {
  if (extension === ".pdf") {
    ensurePdfWorker();
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    return result.text ?? "";
  }
  if (extension === ".docx") {
    const result = await mammoth.extractRawText({ buffer });
    return result.value ?? "";
  }
  return buffer.toString("utf8");
};

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Resume file is required." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: "File is too large. Max 5MB." },
        { status: 400 }
      );
    }

    const extension = path.extname(file.name || "").toLowerCase();
    const allowedExtensions = new Set([".pdf", ".docx", ".txt", ".md"]);

    if (!allowedExtensions.has(extension)) {
      return NextResponse.json(
        { error: "Unsupported file type." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const extractedText = sanitizeText(await extractText(buffer, extension));

    if (!extractedText) {
      return NextResponse.json(
        { error: "Could not extract text from the uploaded file." },
        { status: 400 }
      );
    }

    const system = await getPrompt();

    const result = await generateObject({
      model: openai("gpt-5-nano"),
      system,
      prompt: `Resume text:\n${extractedText}`,
      schema: resumeImportSchema,
    });

    const normalizedFeedback = ensureFeedbackCoverage(
      result.object.resume,
      result.object.fieldFeedback
    );

    return NextResponse.json({
      resume: result.object.resume,
      fieldFeedback: normalizedFeedback,
      raw: result.object,
    });
  } catch (error) {
    console.error("Error importing resume:", error);
    return NextResponse.json(
      { error: "Failed to import resume." },
      { status: 500 }
    );
  }
}
