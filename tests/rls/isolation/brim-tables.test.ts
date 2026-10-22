import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prepareRlsAppRole, rlsDatabaseUrl, rlsSql, rlsTransaction } from "@tests/helpers/rls-env";

const url = rlsDatabaseUrl();

describe.skipIf(!url)("journey cost FORCE RLS (live DATABASE_URL)", () => {
  it("hides other-tenant brim_vehicles rows without a Drizzle tenant filter", async ({ skip }) => {
    const sql = rlsSql();
    if ((await prepareRlsAppRole(sql)) === "unavailable") {
      skip();
      return;
    }
    const tenantA = `rls-brim-a-${randomUUID()}`;
    const tenantB = `rls-brim-b-${randomUUID()}`;
    const vehicleId = randomUUID();
    try {
      await rlsTransaction(sql, [
        sql`SELECT set_config('app.tenant', ${tenantA}, true)`,
        sql`
          INSERT INTO brim_vehicles (id, tenant, kind, propulsion)
          VALUES (${vehicleId}, ${tenantA}, 'car', 'petrol')
        `,
      ]);
      const results = await rlsTransaction(sql, [
        sql`SELECT set_config('app.tenant', ${tenantB}, true)`,
        sql`SELECT id FROM brim_vehicles WHERE id = ${vehicleId}`,
      ]);
      const visible = results[results.length - 1] as { id: string }[];
      expect(visible).toEqual([]);
    } finally {
      await rlsTransaction(sql, [
        sql`SELECT set_config('app.tenant', ${tenantA}, true)`,
        sql`DELETE FROM brim_vehicles WHERE tenant = ${tenantA} AND id = ${vehicleId}`,
      ]);
    }
  });

  it("rejects a brim_journeys insert whose tenant differs from the GUC", async ({ skip }) => {
    const sql = rlsSql();
    if ((await prepareRlsAppRole(sql)) === "unavailable") {
      skip();
      return;
    }
    await expect(
      rlsTransaction(sql, [
        sql`SELECT set_config('app.tenant', ${`rls-brim-guc-${randomUUID()}`}, true)`,
        sql`
          INSERT INTO brim_journeys (id, tenant, origin_label, dest_label, distance_meters, duration_seconds, estimate_json, charges_json)
          VALUES (${randomUUID()}, 'someone-else', 'A', 'B', 1, 1, '{}'::jsonb, '[]'::jsonb)
        `,
      ]),
    ).rejects.toThrow();
  });
});
