import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { runMigrations, type MigrationExecutor } from "../../../../packages/db/src/migrate";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const drizzleDir = resolve(root, "packages/db/drizzle");
const dialect = new PgDialect();

function makeMockMigrationDb(opts: { trackingExists: boolean; visitsExists: boolean; applied?: string[] }) {
  let trackingCreated = opts.trackingExists;
  const recorded = new Set<string>(opts.applied ?? []);
  const executedRaw: string[] = [];

  const db: MigrationExecutor = {
    async execute(query) {
      const compiled = dialect.sqlToQuery(query);
      const text = compiled.sql.trim();
      const params = compiled.params;

      if (text.includes("FROM information_schema.tables")) {
        const tableName = String(params[0] ?? "");
        if (tableName === "__locations_migrations") {
          return { rows: [{ exists: trackingCreated }] };
        }
        if (tableName === "visits") {
          return { rows: [{ exists: opts.visitsExists }] };
        }
        return { rows: [{ exists: false }] };
      }

      if (text.startsWith('CREATE TABLE IF NOT EXISTS "__locations_migrations"')) {
        trackingCreated = true;
        return { rows: [] };
      }

      if (text.startsWith('INSERT INTO "__locations_migrations"')) {
        recorded.add(String(params[0]));
        return { rows: [] };
      }

      if (text.startsWith('SELECT "name" FROM "__locations_migrations"')) {
        return { rows: [...recorded].map((name) => ({ name })) };
      }

      executedRaw.push(text);
      return { rows: [] };
    },
  };

  return { db, recorded, executedRaw };
}

describe("drizzle migrations & idempotent runner", () => {
  it("keeps meta/_journal.json in valid Drizzle Kit v7 format matching sql files", () => {
    const raw = JSON.parse(readFileSync(resolve(drizzleDir, "meta/_journal.json"), "utf8")) as {
      version?: string;
      dialect?: string;
      entries?: Array<{ idx: number; tag: string }>;
    };
    expect(raw.version).toBe("7");
    expect(raw.dialect).toBe("postgresql");
    expect(Array.isArray(raw.entries)).toBe(true);

    const sqlFiles = readdirSync(drizzleDir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => f.replace(/\.sql$/, ""));
    expect(raw.entries?.map((e) => e.tag)).toEqual(sqlFiles);
  });

  it("0024_sequence_grants.sql grants sequence privileges and drops legacy pre-tenant indexes", () => {
    const sqlText = readFileSync(resolve(drizzleDir, "0024_sequence_grants.sql"), "utf8");
    expect(sqlText).toContain("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO locations_app");
    expect(sqlText).toContain("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO locations_app");
    expect(sqlText).toContain("DROP INDEX IF EXISTS visits_date_idx, activities_date_idx");
  });

  it("backfills 0000..0023 on existing DBs when __locations_migrations is first created", async () => {
    const files = [
      { name: "0000_init.sql", body: "SELECT 1;" },
      { name: "0001_tenant.sql", body: "ALTER TABLE day_stats DROP CONSTRAINT day_stats_pkey;" },
      { name: "0023_import_job_rows.sql", body: "ALTER TABLE visits ADD COLUMN IF NOT EXISTS import_job_id text;" },
      { name: "0024_sequence_grants.sql", body: "DROP INDEX IF EXISTS visits_date_idx, activities_date_idx;" },
    ];
    const { db, recorded, executedRaw } = makeMockMigrationDb({
      trackingExists: false,
      visitsExists: true,
    });

    const result = await runMigrations(db, files, () => undefined);
    expect(result.backfilled).toEqual(["0000_init.sql", "0001_tenant.sql", "0023_import_job_rows.sql"]);
    expect(result.skipped).toEqual(["0000_init.sql", "0001_tenant.sql", "0023_import_job_rows.sql"]);
    expect(result.applied).toEqual(["0024_sequence_grants.sql"]);
    expect(executedRaw).toEqual(["DROP INDEX IF EXISTS visits_date_idx, activities_date_idx"]);
    expect(recorded.has("0024_sequence_grants.sql")).toBe(true);
  });

  it("runs all migrations in lexical order on a fresh database", async () => {
    const files = [
      { name: "0001_tenant.sql", body: "SELECT 2;" },
      { name: "0000_init.sql", body: "SELECT 1;" },
    ];
    const { db, executedRaw } = makeMockMigrationDb({
      trackingExists: false,
      visitsExists: false,
    });

    const result = await runMigrations(db, files, () => undefined);
    expect(result.backfilled).toEqual([]);
    expect(result.applied).toEqual(["0000_init.sql", "0001_tenant.sql"]);
    expect(executedRaw).toEqual(["SELECT 1", "SELECT 2"]);
  });
});
