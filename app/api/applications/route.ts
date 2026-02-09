import { NextResponse } from "next/server";
import { db, applications } from "@/lib/db";
import { desc } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET() {
  try {
    const allApplications = await db
      .select()
      .from(applications)
      .orderBy(desc(applications.createdAt));

    return NextResponse.json(allApplications);
  } catch (error) {
    console.error("Error fetching applications:", error);
    return NextResponse.json(
      { error: "Failed to fetch applications" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      companyName,
      jobTitle,
      jobUrl,
      jobDescription,
      resumeContent,
      coverLetterContent,
      notes,
    } = body;

    if (!companyName || !jobTitle || (!jobDescription && !jobUrl)) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const toTextOrNull = (value: unknown) => {
      if (value == null) return null;
      if (typeof value === "string") return value;
      try {
        return JSON.stringify(value);
      } catch {
        return null;
      }
    };

    const result = await db
      .insert(applications)
      .values({
        companyName,
        jobTitle,
        jobUrl: jobUrl || null,
        jobDescription: jobDescription || "",
        status: "draft",
        resumeContent: toTextOrNull(resumeContent),
        coverLetterContent: toTextOrNull(coverLetterContent),
        notes: toTextOrNull(notes),
      })
      .returning();

    return NextResponse.json(result[0], { status: 201 });
  } catch (error) {
    console.error("Error creating application:", error);
    return NextResponse.json(
      { error: "Failed to create application" },
      { status: 500 }
    );
  }
}
