import { describe, expect, it } from "vitest";
import { analyticsCache, rebuildHourOfWeekCache, rebuildTenantAggregates, visits } from "@locations/db";

/** Home and work in the same 0.5 degree region: commute has nothing to show (null). */
const sameRegion = (start: string, semanticType: string) => ({
  id: 1,
  tenant: "t1",
  sourceId: "s",
  start,
  end: start,
  date: start.slice(0, 10),
  lat: 51.48,
  lon: -3.18,
  cluster: "51.5°N 3.0°W",
  semanticType,
  placeId: null,
  durationMinutes: 60,
  fixLat: null,
  fixLon: null,
  fixCount: null,
  placeKey: null,
  googleName: null,
});

/** Fake Drizzle that records analytics_cache writes and deletes. */
function fakeDb() {
  const upserts: { key: string; data: unknown }[] = [];
  const deletes: unknown[] = [];
  const rows = [sameRegion("2024-01-01T23:00:00Z", "Home"), sameRegion("2024-01-02T10:00:00Z", "Work")];
  const query = (table: unknown) => {
    const result = table === visits ? rows : [];
    const q = {
      where: () => q,
      limit: async () => result,
      then: (resolve: (r: unknown[]) => unknown) => resolve(result),
    };
    return q;
  };
  const db = {
    execute: async () => undefined,
    select: () => ({ from: (table: unknown) => query(table) }),
    insert: (table: unknown) => ({
      values: (v: { key?: string; data?: unknown }) => {
        const done = Promise.resolve();
        return Object.assign(done, {
          onConflictDoUpdate: async () => {
            if (table === analyticsCache) upserts.push({ key: v.key!, data: v.data });
          },
        });
      },
    }),
    delete: () => ({ where: async (w: unknown) => void deletes.push(w) }),
  };
  return { db: db as never, upserts, deletes };
}

describe("analytics cache rebuilds", () => {
  it("never write null data (analytics_cache.data is NOT NULL)", async () => {
    const { db, upserts } = fakeDb();
    await rebuildTenantAggregates(db, "t1");
    expect(upserts.some((u) => u.data === null)).toBe(false);
    expect(upserts.some((u) => u.key === "commute")).toBe(false);
    expect(upserts.some((u) => u.key === "home-work")).toBe(true);
  });

  it("clear a timezone cache that has become empty", async () => {
    const { db, upserts, deletes } = fakeDb();
    await rebuildHourOfWeekCache(db, "t1", "Europe/London");
    expect(upserts.some((u) => u.data === null)).toBe(false);
    expect(deletes.length).toBeGreaterThanOrEqual(1);
  });
});
