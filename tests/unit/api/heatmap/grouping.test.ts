import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { visits } from "@locations/db";
import { getHeatmap } from "@locations/api/services";

// Postgres now groups stays per cell; getHeatmap merges the grouped rows. The fake returns
// what those two queries would: rows per (cell, cluster, type), then distinct days per cell.
type Part = { lat: string; lon: string; cluster: string; semanticType: string; n: number; minutes: number };
type Days = { lat: string; lon: string; days: number };

function fakeDb(parts: Part[], dayCounts: Days[]) {
  let visitQueries = 0;
  const chain = (rows: unknown[]) => {
    const q: Record<string, unknown> = {};
    for (const m of ["where", "groupBy", "orderBy", "innerJoin", "leftJoin"]) q[m] = () => q;
    q.limit = async () => rows;
    q.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(rows).then(resolve, reject);
    return q;
  };
  return {
    select: () => ({
      from: (table: unknown) =>
        chain(table === visits ? (visitQueries++ % 2 === 0 ? parts : dayCounts) : []),
    }),
    insert: () => ({
      values: () => ({ onConflictDoNothing: async () => {}, onConflictDoUpdate: async () => {} }),
    }),
  } as never;
}

describe("getHeatmap", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("merges grouped rows into one point per cell", async () => {
    const parts: Part[] = [
      { lat: "51.5", lon: "-0.1", cluster: "Home", semanticType: "Home", n: 5, minutes: 600.4 },
      { lat: "51.5", lon: "-0.1", cluster: "Home", semanticType: "Unknown", n: 2, minutes: 30 },
      { lat: "51.5", lon: "-0.1", cluster: "", semanticType: "", n: 1, minutes: 10 },
      { lat: "52.1", lon: "-1.2", cluster: "Gym", semanticType: "Unknown", n: 3, minutes: 90 },
    ];
    const days: Days[] = [
      { lat: "51.5", lon: "-0.1", days: 6 },
      { lat: "52.1", lon: "-1.2", days: 3 },
    ];
    const points = await getHeatmap(fakeDb(parts, days), "t1" as never, {});
    expect(points).toHaveLength(2);
    const [home, gym] = points;
    expect(home).toMatchObject({
      lat: 51.5,
      lon: -0.1,
      count: 8,
      totalDurationMinutes: 640,
      uniqueDays: 6,
      label: "Home",
      cluster: "Home",
      topTypes: ["Home"],
    });
    // Only "Unknown" known: it is kept rather than showing no type at all.
    expect(gym).toMatchObject({ count: 3, uniqueDays: 3, topTypes: ["Unknown"] });
  });

  it("does not depend on the order Postgres returns groups", async () => {
    const parts: Part[] = [
      { lat: "51.5", lon: "-0.1", cluster: "B", semanticType: "Cafe", n: 2, minutes: 20 },
      { lat: "51.5", lon: "-0.1", cluster: "A", semanticType: "Shop", n: 2, minutes: 20 },
      { lat: "53", lon: "-2", cluster: "C", semanticType: "Park", n: 2, minutes: 5 },
    ];
    const days: Days[] = [
      { lat: "51.5", lon: "-0.1", days: 2 },
      { lat: "53", lon: "-2", days: 1 },
    ];
    const a = await getHeatmap(fakeDb(parts, days), "t1" as never, {});
    const b = await getHeatmap(fakeDb([...parts].reverse(), [...days].reverse()), "t1" as never, {});
    expect(b).toEqual(a);
    // A cluster or type tie breaks by name, so "A" labels the busier cell either way.
    expect(a.map((p) => p.cluster)).toEqual(["A", "C"]);
    expect(a[0].topTypes).toEqual(["Cafe", "Shop"]);
  });
});
