import { NextResponse } from "next/server";
import { db, applications } from "@/lib/db";
import { desc } from "drizzle-orm";

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
    const { companyName, jobTitle, jobUrl, jobDescription } = body;

    if (!companyName || !jobTitle || !jobDescription) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const result = await db.insert(applications).values({
      companyName,
      jobTitle,
      jobUrl: jobUrl || null,
      jobDescription,
      status: "draft",
    }).returning();

    return NextResponse.json(result[0], { status: 201 });
  } catch (error) {
    console.error("Error creating application:", error);
    return NextResponse.json(
      { error: "Failed to create application" },
      { status: 500 }
    );
  }
}
