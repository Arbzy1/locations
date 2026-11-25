import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { TENANT_TABLES } from "@tests/helpers/tenant-tables";
import { prepareRlsAppRole, rlsDatabaseUrl, rlsSql, rlsTransaction } from "@tests/helpers/rls-env";
import { CORE_TENANT_TABLES_TESTED } from "./force-rls.test";

const url = rlsDatabaseUrl();

export const BRIM_TENANT_TABLES_TESTED = [
  "brim_vehicles",
  "brim_tariffs",
  "brim_calibrations",
  "brim_fill_ups",
  "brim_journeys",
  "brim_settings",
  "brim_saved_places",
] as const;

describe("RLS behavioral suite table coverage", () => {
  it("covers all 20 TENANT_TABLES across force-rls and brim-tables suites", () => {
    const covered = new Set<string>([...CORE_TENANT_TABLES_TESTED, ...BRIM_TENANT_TABLES_TESTED]);
    const missing = TENANT_TABLES.filter((t) => !covered.has(t));
    expect(missing).toEqual([]);
    expect(covered.size).toBe(TENANT_TABLES.length);
  });
});

describe.skipIf(!url)("journey cost FORCE RLS (live DATABASE_URL)", () => {
  it("isolates all 7 brim_* tenant tables across tenants without Drizzle tenant filters", async ({ skip }) => {
    const sql = rlsSql();
    if ((await prepareRlsAppRole(sql)) === "unavailable") {
      skip();
      return;
    }
    const tenantA = `rls-brim-a-${randomUUID()}`;
    const tenantB = `rls-brim-b-${randomUUID()}`;
    const vehicleId = randomUUID();
    const tariffId = randomUUID();
    const calibrationId = randomUUID();
    const fillUpId = randomUUID();
    const journeyId = randomUUID();
    const placeId = randomUUID();
    try {
      await rlsTransaction(sql, [
        sql`SELECT set_config('app.tenant', ${tenantA}, true)`,
        sql`
          INSERT INTO brim_vehicles (id, tenant, kind, propulsion)
          VALUES (${vehicleId}, ${tenantA}, 'car', 'petrol')
        `,
        sql`
          INSERT INTO brim_tariffs (id, tenant, vehicle_id, kind, pence_per_kwh, is_default)
          VALUES (${tariffId}, ${tenantA}, ${vehicleId}, 'home', 24.5, true)
        `,
        sql`
          INSERT INTO brim_calibrations (id, tenant, vehicle_id, calculated_value, unit, sample_count)
          VALUES (${calibrationId}, ${tenantA}, ${vehicleId}, 45.2, 'mpg', 3)
        `,
        sql`
          INSERT INTO brim_fill_ups (id, tenant, vehicle_id, odometer_miles, quantity, unit, price_pence, filled_to_brim, occurred_at)
          VALUES (${fillUpId}, ${tenantA}, ${vehicleId}, 12000, 40, 'litres', 5600, true, now())
        `,
        sql`
          INSERT INTO brim_journeys (id, tenant, vehicle_id, origin_label, dest_label, distance_meters, duration_seconds, estimate_json, charges_json)
          VALUES (${journeyId}, ${tenantA}, ${vehicleId}, 'A', 'B', 10000, 900, '{}'::jsonb, '[]'::jsonb)
        `,
        sql`
          INSERT INTO brim_settings (tenant, default_vehicle_id)
          VALUES (${tenantA}, ${vehicleId})
        `,
        sql`
          INSERT INTO brim_saved_places (id, tenant, kind, label, lat, lng)
          VALUES (${placeId}, ${tenantA}, 'home', 'Probe Home', 51.5, -0.1)
        `,
      ]);

      const results = await rlsTransaction(sql, [
        sql`SELECT set_config('app.tenant', ${tenantB}, true)`,
        sql`SELECT id FROM brim_vehicles WHERE id = ${vehicleId}`,
        sql`SELECT id FROM brim_tariffs WHERE id = ${tariffId}`,
        sql`SELECT id FROM brim_calibrations WHERE id = ${calibrationId}`,
        sql`SELECT id FROM brim_fill_ups WHERE id = ${fillUpId}`,
        sql`SELECT id FROM brim_journeys WHERE id = ${journeyId}`,
        sql`SELECT tenant FROM brim_settings WHERE tenant = ${tenantA}`,
        sql`SELECT id FROM brim_saved_places WHERE id = ${placeId}`,
      ]);
      for (const rows of results.slice(-7)) {
        expect(rows).toEqual([]);
      }
    } finally {
      await rlsTransaction(sql, [
        sql`SELECT set_config('app.tenant', ${tenantA}, true)`,
        sql`DELETE FROM brim_saved_places WHERE tenant = ${tenantA} AND id = ${placeId}`,
        sql`DELETE FROM brim_settings WHERE tenant = ${tenantA}`,
        sql`DELETE FROM brim_journeys WHERE tenant = ${tenantA} AND id = ${journeyId}`,
        sql`DELETE FROM brim_fill_ups WHERE tenant = ${tenantA} AND id = ${fillUpId}`,
        sql`DELETE FROM brim_calibrations WHERE tenant = ${tenantA} AND id = ${calibrationId}`,
        sql`DELETE FROM brim_tariffs WHERE tenant = ${tenantA} AND id = ${tariffId}`,
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
