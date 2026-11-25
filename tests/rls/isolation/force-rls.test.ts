import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { TENANT_TABLES } from "@tests/helpers/tenant-tables";
import {
  prepareRlsAppRole,
  rlsDatabaseUrl,
  rlsSql,
  rlsTransaction,
} from "@tests/helpers/rls-env";

const url = rlsDatabaseUrl();

export const CORE_TENANT_TABLES_TESTED = [
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
  "timeline_overrides",
] as const;

describe.skipIf(!url)("FORCE RLS (live DATABASE_URL)", () => {
  it("marks tenant tables FORCE ROW LEVEL SECURITY", async () => {
    const sql = rlsSql();
    const rows = await sql`
      SELECT c.relname AS name, c.relforcerowsecurity AS forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = ANY(${[...TENANT_TABLES]})
    `;
    const byName = new Map(rows.map((r) => [String(r.name), Boolean(r.forced)]));
    for (const table of TENANT_TABLES) {
      expect(byName.get(table), `${table} should FORCE RLS`).toBe(true);
    }
  });

  it("allows SERIAL inserts on visits and activities as locations_app and isolates across tenants", async ({ skip }) => {
    const sql = rlsSql();
    if ((await prepareRlsAppRole(sql)) === "unavailable") {
      skip();
      return;
    }
    const tenantA = `rls-seq-a-${randomUUID()}`;
    const tenantB = `rls-seq-b-${randomUUID()}`;
    const marker = `seq-${randomUUID()}`;
    try {
      const inserted = await rlsTransaction(sql, [
        sql`SELECT set_config('app.tenant', ${tenantA}, true)`,
        sql`
          INSERT INTO visits (tenant, start, "end", date, lat, lon, cluster, semantic_type, duration_minutes)
          VALUES (${tenantA}, '2024-01-01T08:00:00Z', '2024-01-01T09:00:00Z', '2024-01-01', 51.5, -0.1, ${marker}, 'Unknown', 60)
          RETURNING id
        `,
        sql`
          INSERT INTO activities (tenant, start, "end", date, start_lat, start_lon, end_lat, end_lon, mode, distance_meters, duration_minutes, google_mode)
          VALUES (${tenantA}, '2024-01-01T09:00:00Z', '2024-01-01T09:30:00Z', '2024-01-01', 51.5, -0.1, 51.51, -0.11, 'walking', 1200, 30, ${marker})
          RETURNING id
        `,
      ]);
      const visitRow = (inserted[inserted.length - 2] as { id: number }[])[0];
      const actRow = (inserted[inserted.length - 1] as { id: number }[])[0];
      expect(typeof visitRow?.id).toBe("number");
      expect(typeof actRow?.id).toBe("number");

      const otherRead = await rlsTransaction(sql, [
        sql`SELECT set_config('app.tenant', ${tenantB}, true)`,
        sql`SELECT id FROM visits WHERE cluster = ${marker}`,
        sql`SELECT id FROM activities WHERE google_mode = ${marker}`,
      ]);
      expect(otherRead[otherRead.length - 2]).toEqual([]);
      expect(otherRead[otherRead.length - 1]).toEqual([]);
    } finally {
      await rlsTransaction(sql, [
        sql`SELECT set_config('app.tenant', ${tenantA}, true)`,
        sql`DELETE FROM visits WHERE tenant = ${tenantA}`,
        sql`DELETE FROM activities WHERE tenant = ${tenantA}`,
      ]);
    }
  });

  it("isolates day_stats, analytics_cache, data_sources, import_jobs, export_jobs, user_settings, subscriptions, and life_chapters across tenants", async ({
    skip,
  }) => {
    const sql = rlsSql();
    if ((await prepareRlsAppRole(sql)) === "unavailable") {
      skip();
      return;
    }
    const tenantA = `rls-core-a-${randomUUID()}`;
    const tenantB = `rls-core-b-${randomUUID()}`;
    const probeDate = "2099-12-31";
    const cacheKey = `probe-${randomUUID()}`;
    const sourceId = randomUUID();
    const importJobId = randomUUID();
    const exportJobId = randomUUID();
    const chapterId = randomUUID();
    try {
      await rlsTransaction(sql, [
        sql`SELECT set_config('app.tenant', ${tenantA}, true)`,
        sql`
          INSERT INTO day_stats (tenant, date, total_distance_miles, modes, clusters, visit_count, activity_count)
          VALUES (${tenantA}, ${probeDate}, 3.5, '{}'::jsonb, '[]'::jsonb, 1, 1)
        `,
        sql`
          INSERT INTO analytics_cache (tenant, key, data)
          VALUES (${tenantA}, ${cacheKey}, '{"ok":true}'::jsonb)
        `,
        sql`
          INSERT INTO data_sources (id, tenant, label)
          VALUES (${sourceId}, ${tenantA}, 'probe-source')
        `,
        sql`
          INSERT INTO import_jobs (id, tenant, source_id, user_id, status)
          VALUES (${importJobId}, ${tenantA}, ${sourceId}, ${tenantA}, 'ready')
        `,
        sql`
          INSERT INTO export_jobs (id, tenant, user_id, status)
          VALUES (${exportJobId}, ${tenantA}, ${tenantA}, 'ready')
        `,
        sql`
          INSERT INTO user_settings (tenant, distance_unit, timezone)
          VALUES (${tenantA}, 'km', 'Europe/London')
        `,
        sql`
          INSERT INTO subscriptions (tenant, status)
          VALUES (${tenantA}, 'active')
        `,
        sql`
          INSERT INTO life_chapters (id, tenant, name, start, "end")
          VALUES (${chapterId}, ${tenantA}, 'probe-chapter', '2024-01-01', '2024-06-01')
        `,
      ]);

      const results = await rlsTransaction(sql, [
        sql`SELECT set_config('app.tenant', ${tenantB}, true)`,
        sql`SELECT tenant FROM day_stats WHERE date = ${probeDate} AND tenant = ${tenantA}`,
        sql`SELECT tenant FROM analytics_cache WHERE key = ${cacheKey}`,
        sql`SELECT id FROM data_sources WHERE id = ${sourceId}`,
        sql`SELECT id FROM import_jobs WHERE id = ${importJobId}`,
        sql`SELECT id FROM export_jobs WHERE id = ${exportJobId}`,
        sql`SELECT tenant FROM user_settings WHERE tenant = ${tenantA}`,
        sql`SELECT tenant FROM subscriptions WHERE tenant = ${tenantA}`,
        sql`SELECT id FROM life_chapters WHERE id = ${chapterId}`,
      ]);
      for (const rows of results.slice(-8)) {
        expect(rows).toEqual([]);
      }
    } finally {
      await rlsTransaction(sql, [
        sql`SELECT set_config('app.tenant', ${tenantA}, true)`,
        sql`DELETE FROM life_chapters WHERE tenant = ${tenantA} AND id = ${chapterId}`,
        sql`DELETE FROM subscriptions WHERE tenant = ${tenantA}`,
        sql`DELETE FROM user_settings WHERE tenant = ${tenantA}`,
        sql`DELETE FROM export_jobs WHERE tenant = ${tenantA} AND id = ${exportJobId}`,
        sql`DELETE FROM import_jobs WHERE tenant = ${tenantA} AND id = ${importJobId}`,
        sql`DELETE FROM data_sources WHERE tenant = ${tenantA} AND id = ${sourceId}`,
        sql`DELETE FROM analytics_cache WHERE tenant = ${tenantA} AND key = ${cacheKey}`,
        sql`DELETE FROM day_stats WHERE tenant = ${tenantA} AND date = ${probeDate}`,
      ]);
    }
  });

  it("hides other-tenant place_labels rows without a Drizzle tenant filter", async ({ skip }) => {
    const sql = rlsSql();
    if ((await prepareRlsAppRole(sql)) === "unavailable") {
      skip();
      return;
    }
    const tenantA = `rls-a-${randomUUID()}`;
    const tenantB = `rls-b-${randomUUID()}`;
    const placeKey = `rls-probe-${randomUUID()}`;
    try {
      await rlsTransaction(sql, [
        sql`SELECT set_config('app.tenant', ${tenantA}, true)`,
        sql`
          INSERT INTO place_labels (tenant, place_key, label, hidden, favourite)
          VALUES (${tenantA}, ${placeKey}, 'probe', false, false)
        `,
      ]);
      const results = await rlsTransaction(sql, [
        sql`SELECT set_config('app.tenant', ${tenantB}, true)`,
        sql`SELECT tenant FROM place_labels WHERE place_key = ${placeKey}`,
      ]);
      const visible = results[results.length - 1] as { tenant: string }[];
      expect(visible).toEqual([]);
    } finally {
      await rlsTransaction(sql, [
        sql`SELECT set_config('app.tenant', ${tenantA}, true)`,
        sql`DELETE FROM place_labels WHERE tenant = ${tenantA} AND place_key = ${placeKey}`,
      ]);
    }
  });

  it("hides other-tenant timeline_overrides rows without a Drizzle tenant filter", async ({ skip }) => {
    const sql = rlsSql();
    if ((await prepareRlsAppRole(sql)) === "unavailable") {
      skip();
      return;
    }
    const tenantA = `rls-note-a-${randomUUID()}`;
    const tenantB = `rls-note-b-${randomUUID()}`;
    const start = `2024-01-01T00:00:00Z#${randomUUID()}`;
    try {
      await rlsTransaction(sql, [
        sql`SELECT set_config('app.tenant', ${tenantA}, true)`,
        sql`
          INSERT INTO timeline_overrides (tenant, kind, item_start, note)
          VALUES (${tenantA}, 'visit', ${start}, 'probe')
        `,
      ]);
      const results = await rlsTransaction(sql, [
        sql`SELECT set_config('app.tenant', ${tenantB}, true)`,
        sql`SELECT tenant FROM timeline_overrides WHERE item_start = ${start}`,
      ]);
      const visible = results[results.length - 1] as { tenant: string }[];
      expect(visible).toEqual([]);
    } finally {
      await rlsTransaction(sql, [
        sql`SELECT set_config('app.tenant', ${tenantA}, true)`,
        sql`DELETE FROM timeline_overrides WHERE tenant = ${tenantA} AND item_start = ${start}`,
      ]);
    }
  });

  it("hides other-tenant named_trips rows without a Drizzle tenant filter", async ({ skip }) => {
    const sql = rlsSql();
    if ((await prepareRlsAppRole(sql)) === "unavailable") {
      skip();
      return;
    }
    const tenantA = `rls-trip-a-${randomUUID()}`;
    const tenantB = `rls-trip-b-${randomUUID()}`;
    const tripId = randomUUID();
    try {
      await rlsTransaction(sql, [
        sql`SELECT set_config('app.tenant', ${tenantA}, true)`,
        sql`
          INSERT INTO named_trips (id, tenant, name, start, "end")
          VALUES (${tripId}, ${tenantA}, 'probe', '2024-01-01', '2024-01-05')
        `,
      ]);
      const results = await rlsTransaction(sql, [
        sql`SELECT set_config('app.tenant', ${tenantB}, true)`,
        sql`SELECT id FROM named_trips WHERE id = ${tripId}`,
      ]);
      const visible = results[results.length - 1] as { id: string }[];
      expect(visible).toEqual([]);
    } finally {
      await rlsTransaction(sql, [
        sql`SELECT set_config('app.tenant', ${tenantA}, true)`,
        sql`DELETE FROM named_trips WHERE tenant = ${tenantA} AND id = ${tripId}`,
      ]);
    }
  });

  it("runs as locations_app with rolbypassrls false", async ({ skip }) => {
    const sql = rlsSql();
    if ((await prepareRlsAppRole(sql)) === "unavailable") {
      skip();
      return;
    }
    const results = await rlsTransaction(sql, [
      sql`SELECT current_user AS usr, rolbypassrls AS bypass FROM pg_roles WHERE rolname = current_user`,
    ]);
    const row = (results[results.length - 1] as { usr: string; bypass: boolean }[])[0];
    expect(Boolean(row?.bypass)).toBe(false);
  });
});
