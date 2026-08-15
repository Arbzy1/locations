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

  it("hides other-tenant rows without a Drizzle tenant filter", async ({ skip }) => {
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
