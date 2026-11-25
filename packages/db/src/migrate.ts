import { loadEnvFiles } from "./load-env.js";
import { readdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sql, type SQL } from "drizzle-orm";
import { createHttpDb } from "./index.js";
import { splitSql } from "./split-sql.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const BACKFILL_THROUGH_MIGRATION = "0023_import_job_rows.sql";

export const LEGACY_MIGRATION_FILES = [
  "0000_init.sql",
  "0001_tenant.sql",
  "0002_sources.sql",
  "0003_saas.sql",
  "0004_rls.sql",
  "0005_import_notify.sql",
  "0006_place_meta.sql",
  "0007_monthly_recap.sql",
  "0008_catalog_pages.sql",
  "0009_import_quality.sql",
  "0010_export_jobs.sql",
  "0011_map_settings.sql",
  "0012_rls_grants.sql",
  "0013_ops_tables.sql",
  "0014_activity_path.sql",
  "0015_visit_fix.sql",
  "0016_visit_place_key.sql",
  "0017_retention_years.sql",
  "0018_timeline_overrides.sql",
  "0019_visit_google_name.sql",
  "0020_brim.sql",
  "0021_brim_rls.sql",
  "0022_activity_mode_detection.sql",
  "0023_import_job_rows.sql",
] as const;

export type MigrationExecutor = {
  execute: (query: SQL) => Promise<unknown>;
};

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows?: unknown }).rows;
    if (Array.isArray(rows)) return rows as T[];
  }
  return [];
}

async function tableExists(db: MigrationExecutor, tableName: string): Promise<boolean> {
  const res = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${tableName}
    ) AS "exists"
  `);
  const row = rowsOf<{ exists?: boolean }>(res)[0];
  return Boolean(row?.exists);
}

export async function runMigrations(
  db: MigrationExecutor,
  files: Array<{ name: string; body: string }>,
  log: (msg: string) => void = console.log,
): Promise<{ applied: string[]; skipped: string[]; backfilled: string[] }> {
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));
  const trackingExisted = await tableExists(db, "__locations_migrations");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "__locations_migrations" (
      "name" text PRIMARY KEY NOT NULL,
      "applied_at" timestamptz NOT NULL DEFAULT now()
    )
  `);

  const backfilled: string[] = [];
  if (!trackingExisted && (await tableExists(db, "visits"))) {
    const legacy = sorted
      .map((f) => f.name)
      .filter((name) => name <= BACKFILL_THROUGH_MIGRATION);
    const toBackfill = legacy.length > 0 ? legacy : [...LEGACY_MIGRATION_FILES];
    for (const name of toBackfill) {
      await db.execute(sql`
        INSERT INTO "__locations_migrations" ("name")
        VALUES (${name})
        ON CONFLICT ("name") DO NOTHING
      `);
      backfilled.push(name);
    }
    log(`Backfilled ${backfilled.length} existing migrations through ${BACKFILL_THROUGH_MIGRATION}.`);
  }

  const appliedRows = rowsOf<{ name: string }>(
    await db.execute(sql`SELECT "name" FROM "__locations_migrations"`),
  );
  const alreadyApplied = new Set(appliedRows.map((r) => String(r.name)));

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const file of sorted) {
    if (alreadyApplied.has(file.name)) {
      skipped.push(file.name);
      continue;
    }
    const statements = splitSql(file.body);
    log(`Applying ${statements.length} statements from ${file.name}...`);
    for (const statement of statements) {
      try {
        await db.execute(sql.raw(statement));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (
          message.includes("already exists") ||
          message.includes("duplicate key") ||
          message.includes("multiple primary keys")
        ) {
          log(`  skip: ${message.slice(0, 80)}`);
          continue;
        }
        throw err;
      }
    }
    await db.execute(sql`
      INSERT INTO "__locations_migrations" ("name")
      VALUES (${file.name})
      ON CONFLICT ("name") DO NOTHING
    `);
    applied.push(file.name);
  }

  log(`Migrations complete (${applied.length} applied, ${skipped.length} already recorded).`);
  return { applied, skipped, backfilled };
}

async function main() {
  const envName = loadEnvFiles();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error(`DATABASE_URL is required (${envName} env files)`);

  const dir = resolve(__dirname, "../drizzle");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, body: readFileSync(resolve(dir, name), "utf-8") }));

  const db = createHttpDb(url);
  await runMigrations(db, files);
}

const isCliEntry =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCliEntry) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
