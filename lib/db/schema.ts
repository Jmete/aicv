import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const skills = sqliteTable("skills", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  category: text("category").notNull(),
  description: text("description"),
  createdAt: text("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: text("updated_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

export const applications = sqliteTable("applications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyName: text("company_name").notNull(),
  jobTitle: text("job_title").notNull(),
  jobUrl: text("job_url"),
  jobDescription: text("job_description").notNull(),
  status: text("status", {
    enum: ["draft", "applied", "interviewing", "offered", "rejected"],
  })
    .default("draft")
    .notNull(),
  resumeContent: text("resume_content"),
  coverLetterContent: text("cover_letter_content"),
  notes: text("notes"),
  createdAt: text("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: text("updated_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

export const applicationSkills = sqliteTable("application_skills", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  applicationId: integer("application_id")
    .references(() => applications.id, { onDelete: "cascade" })
    .notNull(),
  skillId: integer("skill_id")
    .references(() => skills.id, { onDelete: "cascade" })
    .notNull(),
  relevanceScore: integer("relevance_score").default(0).notNull(),
  isSelected: integer("is_selected", { mode: "boolean" }).default(false).notNull(),
});

export const resumeData = sqliteTable("resume_data", {
  id: integer("id").primaryKey(),
  data: text("data").notNull(),
  createdAt: text("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: text("updated_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

export type Skill = typeof skills.$inferSelect;
export type NewSkill = typeof skills.$inferInsert;
export type Application = typeof applications.$inferSelect;
export type NewApplication = typeof applications.$inferInsert;
export type ApplicationSkill = typeof applicationSkills.$inferSelect;
export type NewApplicationSkill = typeof applicationSkills.$inferInsert;
export type ResumeDataRow = typeof resumeData.$inferSelect;
export type NewResumeDataRow = typeof resumeData.$inferInsert;
