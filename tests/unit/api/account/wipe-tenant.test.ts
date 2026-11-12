import { describe, expect, it } from "vitest";
import { getTableName } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { wipeTenantData } from "@locations/api/services";
import { TENANT_TABLES } from "@tests/helpers/tenant-tables";

/** Records which tables wipeTenantData deletes from, in order. */
function recordingDb() {
  const deleted: string[] = [];
  const db = {
    delete(table: PgTable) {
      deleted.push(getTableName(table));
      return { where: async () => undefined };
    },
  };
  return { db: db as never, deleted };
}

describe("wipeTenantData", () => {
  it("deletes from every tenant table", async () => {
    const { db, deleted } = recordingDb();
    await wipeTenantData(db, "user-a" as never, "user-a", "a@example.com");
    const missing = TENANT_TABLES.filter((table) => !deleted.includes(table));
    expect(missing).toEqual([]);
  });

  it("removes the user's notes and mode fixes", async () => {
    const { db, deleted } = recordingDb();
    await wipeTenantData(db, "user-a" as never, "user-a");
    expect(deleted).toContain("timeline_overrides");
  });

  it("deletes the auth rows last, ending with the user", async () => {
    const { db, deleted } = recordingDb();
    await wipeTenantData(db, "user-a" as never, "user-a", "a@example.com");
    expect(deleted.slice(-4)).toEqual(["verification", "session", "account", "user"]);
  });

  it("deletes vehicle child rows before the vehicles", async () => {
    const { db, deleted } = recordingDb();
    await wipeTenantData(db, "user-a" as never, "user-a");
    const vehicles = deleted.indexOf("brim_vehicles");
    for (const child of ["brim_tariffs", "brim_calibrations", "brim_fill_ups"]) {
      expect(deleted.indexOf(child)).toBeLessThan(vehicles);
    }
  });
});
