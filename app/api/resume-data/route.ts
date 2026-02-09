import { NextResponse } from "next/server";
import { db, resumeData } from "@/lib/db";
import { DEFAULT_RESUME_DATA } from "@/lib/resume-defaults";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";

const RESUME_DATA_ID = 1;

export async function GET() {
  try {
    const rows = await db
      .select()
      .from(resumeData)
      .where(eq(resumeData.id, RESUME_DATA_ID))
      .limit(1);

    if (rows.length === 0) {
      await db.insert(resumeData).values({
        id: RESUME_DATA_ID,
        data: JSON.stringify(DEFAULT_RESUME_DATA),
      });
      return NextResponse.json(DEFAULT_RESUME_DATA);
    }

    let stored = DEFAULT_RESUME_DATA;
    try {
      stored = JSON.parse(rows[0].data);
    } catch (parseError) {
      console.error("Error parsing resume data:", parseError);
    }

    return NextResponse.json(stored);
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
    const body = await request.json();
    const payload = JSON.stringify(body ?? DEFAULT_RESUME_DATA);

    const rows = await db
      .select({ id: resumeData.id })
      .from(resumeData)
      .where(eq(resumeData.id, RESUME_DATA_ID))
      .limit(1);

    if (rows.length === 0) {
      await db.insert(resumeData).values({
        id: RESUME_DATA_ID,
        data: payload,
      });
    } else {
      await db
        .update(resumeData)
        .set({
          data: payload,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(resumeData.id, RESUME_DATA_ID));
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
