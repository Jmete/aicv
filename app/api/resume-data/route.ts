import { NextResponse } from "next/server";
import { db, resumeData } from "@/lib/db";
import { DEFAULT_RESUME_DATA } from "@/lib/resume-defaults";
import {
  applySelectedProfileResumeUpdate,
  createDefaultResumeProfilesData,
  getSelectedResumeData,
  normalizeResumeProfilesData,
} from "@/lib/resume-profiles";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { ResumeData } from "@/types";

export const runtime = "nodejs";

const RESUME_DATA_ID = 1;

const loadResumeProfilesData = async () => {
  const rows = await db
    .select()
    .from(resumeData)
    .where(eq(resumeData.id, RESUME_DATA_ID))
    .limit(1);

  if (rows.length === 0) {
    const defaults = createDefaultResumeProfilesData(DEFAULT_RESUME_DATA);
    await db.insert(resumeData).values({
      id: RESUME_DATA_ID,
      data: JSON.stringify(defaults),
    });
    return defaults;
  }

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(rows[0].data);
  } catch (parseError) {
    console.error("Error parsing resume data:", parseError);
  }

  const normalized = normalizeResumeProfilesData(parsed);
  const serialized = JSON.stringify(normalized);
  if (rows[0].data !== serialized) {
    await db
      .update(resumeData)
      .set({
        data: serialized,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(resumeData.id, RESUME_DATA_ID));
  }

  return normalized;
};

const saveResumeProfilesData = async (payload: unknown) => {
  const normalized = normalizeResumeProfilesData(payload);
  const serialized = JSON.stringify(normalized);
  const rows = await db
    .select({ id: resumeData.id })
    .from(resumeData)
    .where(eq(resumeData.id, RESUME_DATA_ID))
    .limit(1);

  if (rows.length === 0) {
    await db.insert(resumeData).values({
      id: RESUME_DATA_ID,
      data: serialized,
    });
  } else {
    await db
      .update(resumeData)
      .set({
        data: serialized,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(resumeData.id, RESUME_DATA_ID));
  }

  return normalized;
};

export async function GET(request: Request) {
  try {
    const profilesData = await loadResumeProfilesData();
    const mode = new URL(request.url).searchParams.get("mode");
    if (mode === "profiles") {
      return NextResponse.json(profilesData);
    }
    return NextResponse.json(getSelectedResumeData(profilesData));
  } catch (error) {
    console.error("Error fetching resume data:", error);
    return NextResponse.json(
      { error: "Failed to fetch resume data" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const mode = new URL(request.url).searchParams.get("mode");
    const body = await request.json();

    if (mode === "profiles") {
      await saveResumeProfilesData(body);
    } else {
      const profilesData = await loadResumeProfilesData();
      const nextProfilesData = applySelectedProfileResumeUpdate(
        profilesData,
        ((body ?? DEFAULT_RESUME_DATA) as ResumeData)
      );
      await saveResumeProfilesData(nextProfilesData);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error saving resume data:", error);
    return NextResponse.json(
      { error: "Failed to save resume data" },
      { status: 500 }
    );
  }
}
