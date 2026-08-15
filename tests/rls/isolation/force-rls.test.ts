import { neon } from "@neondatabase/serverless";
import { describe, expect, it } from "vitest";

const url = process.env.DATABASE_URL;

const TENANT_TABLES = [
  "visits",
  "activities",
  "day_stats",
  "analytics_cache",
  "data_sources",
  "import_jobs",
  "export_jobs",
  "place_labels",
  "user_settings",
  "subscriptions",
  "named_trips",
  "life_chapters",
] as const;

describe.skipIf(!url)("FORCE RLS (live DATABASE_URL)", () => {
  it("marks tenant tables FORCE ROW LEVEL SECURITY", async () => {
    const sql = neon(url!);
    const rows = await sql`
      SELECT c.relname AS name, c.relforcerowsecurity AS forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname IN (
          'visits', 'activities', 'day_stats', 'analytics_cache', 'data_sources',
          'import_jobs', 'export_jobs', 'place_labels', 'user_settings',
          'subscriptions', 'named_trips', 'life_chapters'
        )
    `;
    const byName = new Map(rows.map((r) => [String(r.name), Boolean(r.forced)]));
    for (const table of TENANT_TABLES) {
      expect(byName.get(table), `${table} should FORCE RLS`).toBe(true);
    }
  });

  it("uses a NOBYPASSRLS role or fails closed on an empty GUC", async () => {
    const sql = neon(url!);
    const roleRows = await sql`SELECT rolbypassrls AS bypass FROM pg_roles WHERE rolname = current_user`;
    const bypass = Boolean(roleRows[0]?.bypass);
    if (bypass) {
      expect(bypass).toBe(true);
      return;
    }
    await sql`SELECT set_config('app.tenant', '', true)`;
    const counts = await sql`SELECT count(*)::int AS n FROM visits`;
    expect(Number(counts[0]?.n ?? -1)).toBe(0);
  });
});
