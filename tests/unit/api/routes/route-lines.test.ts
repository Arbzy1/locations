import { describe, expect, it } from "vitest";
import { getHotspotDays, getRouteLines } from "@locations/api/catalog";

/** Fake Drizzle whose select chain resolves to `rows` (after where/orderBy). */
function rowsDb(rows: unknown[]) {
  const q = {
    from: () => q,
    where: () => q,
    orderBy: async () => rows,
    then: (res: (v: unknown) => unknown) => Promise.resolve(rows).then(res),
  };
  return { select: () => q } as never;
}

const base = {
  date: "2024-06-01",
  start: "2024-06-01T09:00:00.000Z",
  end: "2024-06-01T09:30:00.000Z",
  startLat: 40.7,
  startLon: -74.0,
  endLat: 40.75,
  endLon: -74.0,
  sourceId: "s1",
};

describe("getRouteLines", () => {
  it("uses recorded GPS traces when present and straight lines otherwise", async () => {
    const t = Date.parse(base.start) / 1000;
    const db = rowsDb([
      { ...base, mode: "car", distanceMeters: 5600, path: [[40.72, -73.99, t + 600]] },
      { ...base, mode: "walking", distanceMeters: 1609.34, path: null, sourceId: "s2" },
    ]);
    const result = (await getRouteLines(db, "t1", { from: "2024-06-01", to: "2024-06-30" })) as Exclude<
      Awaited<ReturnType<typeof getRouteLines>>,
      { error: string }
    >;
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]).toMatchObject({ mode: "car", recorded: true });
    expect(result.lines[0].coords).toContainEqual([40.72, -73.99]);
    expect(result.lines[1]).toMatchObject({ mode: "walking", recorded: false, miles: 1 });
    expect(result.lines[1].coords).toEqual([
      [40.7, -74],
      [40.75, -74],
    ]);
    expect(result.modes.walking).toEqual({ count: 1, miles: 1 });
    expect(result.days).toBe(1);
  });

  it("filters by source", async () => {
    const db = rowsDb([
      { ...base, mode: "car", distanceMeters: 1000, path: null },
      { ...base, mode: "car", distanceMeters: 1000, path: null, sourceId: "s2" },
    ]);
    const result = (await getRouteLines(db, "t1", { from: "2024-06-01", to: "2024-06-01", sourceIds: ["s2"] })) as {
      lines: unknown[];
    };
    expect(result.lines).toHaveLength(1);
  });

  it("caps ranges at a year and rejects bad input", async () => {
    const capped = (await getRouteLines(rowsDb([]), "t1", { from: "2020-01-01", to: "2024-12-31" })) as {
      to: string;
      truncated: boolean;
    };
    expect(capped).toMatchObject({ to: "2020-12-31", truncated: true });
    expect(await getRouteLines(rowsDb([]), "t1", { from: "2024-02-01", to: "2024-01-01" })).toHaveProperty("error");
  });
});

describe("getHotspotDays", () => {
  const visit = (date: string, lat: number, minutes: number, hour: string) => ({
    date,
    start: `${date}T${hour}:00:00.000Z`,
    end: `${date}T${hour}:30:00.000Z`,
    lat,
    lon: -0.1,
    cluster: "C",
    semanticType: "Unknown",
    durationMinutes: minutes,
  });

  it("groups nearby stays by day, newest first, and drops ones outside the radius", async () => {
    const db = rowsDb([
      visit("2024-06-01", 51.5, 30, "09"),
      visit("2024-06-01", 51.5001, 45, "14"),
      visit("2024-07-02", 51.5, 60, "10"),
      visit("2024-07-03", 51.51, 99, "10"),
    ]);
    const result = (await getHotspotDays(db, "t1", { lat: 51.5, lon: -0.1, radiusM: 150 })) as {
      days: Array<{ date: string; minutes: number; visits: number; first: string; last: string }>;
      total_minutes: number;
    };
    expect(result.days.map((d) => d.date)).toEqual(["2024-07-02", "2024-06-01"]);
    expect(result.days[1]).toMatchObject({ minutes: 75, visits: 2, first: "2024-06-01T09:00:00.000Z", last: "2024-06-01T14:30:00.000Z" });
    expect(result.total_minutes).toBe(135);
  });

  it("rejects a missing point", async () => {
    expect(await getHotspotDays(rowsDb([]), "t1", { lat: Number.NaN, lon: 0 })).toHaveProperty("error");
  });
});
