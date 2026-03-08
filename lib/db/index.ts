import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import fs from "node:fs";
import path from "path";

const dbPath = path.join(process.cwd(), "data", "aicv.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS skills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT NOT NULL,
    job_title TEXT NOT NULL,
    variation_title TEXT,
    variation_id TEXT,
    job_url TEXT,
    job_description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    resume_content TEXT,
    cover_letter_content TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS application_skills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL,
    skill_id INTEGER NOT NULL,
    relevance_score INTEGER NOT NULL DEFAULT 0,
    is_selected INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(application_id) REFERENCES applications(id) ON DELETE CASCADE,
    FOREIGN KEY(skill_id) REFERENCES skills(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS resume_data (
    id INTEGER PRIMARY KEY,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const applicationColumns = sqlite
  .prepare("PRAGMA table_info(applications)")
  .all() as Array<{ name: string }>;
const hasVariationTitle = applicationColumns.some(
  (column) => column.name === "variation_title"
);
if (!hasVariationTitle) {
  sqlite.exec("ALTER TABLE applications ADD COLUMN variation_title TEXT");
}
const hasVariationId = applicationColumns.some(
  (column) => column.name === "variation_id"
);
if (!hasVariationId) {
  sqlite.exec("ALTER TABLE applications ADD COLUMN variation_id TEXT");
}
sqlite.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS applications_variation_id_unique
  ON applications(variation_id)
  WHERE variation_id IS NOT NULL
`);

export const db = drizzle(sqlite, { schema });

export * from "./schema";
