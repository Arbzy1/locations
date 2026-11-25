import { describe, expect, it } from "vitest";
import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect, type PgTable } from "drizzle-orm/pg-core";
import { wipeTenantData } from "@locations/api/services";
import { TENANT_TABLES } from "@tests/helpers/tenant-tables";

const dialect = new PgDialect();

/** Records which tables wipeTenantData deletes from, in order, plus WHERE SQL. */
function recordingDb() {
  const deleted: string[] = [];
  const whereClauses: Array<{ table: string; sql: string; params: unknown[] }> = [];
  const db = {
    delete(table: PgTable) {
      const name = getTableName(table);
      deleted.push(name);
      return {
        where: async (clause?: SQL) => {
          if (clause) {
            const compiled = dialect.sqlToQuery(clause);
            whereClauses.push({ table: name, sql: compiled.sql, params: compiled.params });
          }
        },
      };
    },
  };
  return { db: db as never, deleted, whereClauses };
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

  it("deletes verification tokens by exact email, colon/hyphen prefixes, and userId value", async () => {
    const { db, whereClauses } = recordingDb();
    await wipeTenantData(db, "user-a" as never, "user-a", "a@example.com");
    const ver = whereClauses.find((w) => w.table === "verification");
    expect(ver).toBeDefined();
    expect(ver?.params).toEqual(
      expect.arrayContaining(["a@example.com", "%:a@example.com", "%-a@example.com", "user-a"]),
    );
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
