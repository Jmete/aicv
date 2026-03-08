import { NextResponse } from "next/server";
import { db, applications } from "@/lib/db";
import { desc, eq } from "drizzle-orm";
import { createId } from "@/lib/id";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const variationId = searchParams.get("variationId")?.trim() ?? "";
    if (variationId) {
      const rows = await db
        .select()
        .from(applications)
        .where(eq(applications.variationId, variationId))
        .limit(1);
      if (rows.length === 0) {
        return NextResponse.json({ error: "Application not found" }, { status: 404 });
      }
      return NextResponse.json(rows[0]);
    }

    const rawId = searchParams.get("id")?.trim() ?? "";
    if (rawId) {
      const id = Number(rawId);
      if (!Number.isInteger(id) || id < 1) {
        return NextResponse.json({ error: "Invalid application id" }, { status: 400 });
      }

      const rows = await db
        .select()
        .from(applications)
        .where(eq(applications.id, id))
        .limit(1);
      if (rows.length === 0) {
        return NextResponse.json({ error: "Application not found" }, { status: 404 });
      }
      return NextResponse.json(rows[0]);
    }

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
      variationTitle,
      variationId,
      jobUrl,
      jobDescription,
      resumeContent,
      coverLetterContent,
      notes,
    } = body;

    const toTrimmedText = (value: unknown, maxLength: number) =>
      typeof value === "string" ? value.trim().slice(0, maxLength) : "";

    const normalizedCompanyName = toTrimmedText(companyName, 160);
    const normalizedJobTitle = toTrimmedText(jobTitle, 160);
    const normalizedVariationTitle = toTrimmedText(variationTitle, 160);
    const normalizedVariationId = toTrimmedText(variationId, 160);
    const normalizedJobUrl = toTrimmedText(jobUrl, 2048);
    const normalizedJobDescription = toTrimmedText(jobDescription, 100000);

    if (
      !normalizedVariationTitle &&
      (!normalizedCompanyName ||
        !normalizedJobTitle ||
        (!normalizedJobDescription && !normalizedJobUrl))
    ) {
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

    const nextVariationTitle =
      normalizedVariationTitle || normalizedJobTitle || "Untitled Variation";

    let nextVariationId = normalizedVariationId || createId();
    // Avoid unique index collisions for user-supplied IDs.
    while (true) {
      const existing = await db
        .select({ id: applications.id })
        .from(applications)
        .where(eq(applications.variationId, nextVariationId))
        .limit(1);
      if (existing.length === 0) break;
      nextVariationId = createId();
    }

    const result = await db
      .insert(applications)
      .values({
        companyName: normalizedCompanyName || "Saved Variation",
        jobTitle: normalizedJobTitle || nextVariationTitle,
        variationTitle: nextVariationTitle,
        variationId: nextVariationId,
        jobUrl: normalizedJobUrl || null,
        jobDescription: normalizedJobDescription,
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
