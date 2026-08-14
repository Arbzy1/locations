import { describe, expect, it } from "vitest";
import {
  buildStore,
  computeAllAnalytics,
  computeFunFacts,
  computeHourOfWeek,
  computeLapsedPlaces,
  computePersonality,
  computePlaceDeltas,
  computeStreaks,
  computeYearInReviewForYear,
  streakStats,
} from "@locations/db";
import type { ActivityRow, DayStatsRow, VisitRow } from "@locations/db";

function visit(partial: Partial<VisitRow> & { date: string; start: string }): VisitRow {
  return {
    id: partial.id ?? 1,
    tenant: "t",
    sourceId: "s",
    start: partial.start,
    end: partial.end ?? partial.start,
    date: partial.date,
    lat: partial.lat ?? 40.7,
    lon: partial.lon ?? -74,
    cluster: partial.cluster ?? "home",
    semanticType: partial.semanticType ?? "Unknown",
    placeId: null,
    durationMinutes: partial.durationMinutes ?? 60,
  };
}

function activity(
  partial: Partial<ActivityRow> & { date: string; start: string },
): ActivityRow {
  return {
    id: partial.id ?? 1,
    tenant: "t",
    sourceId: "s",
    start: partial.start,
    end: partial.end ?? partial.start,
    date: partial.date,
    startLat: partial.startLat ?? 40.7,
    startLon: partial.startLon ?? -74,
    endLat: partial.endLat ?? 40.8,
    endLon: partial.endLon ?? -74,
    mode: partial.mode ?? "car",
    distanceMeters: partial.distanceMeters ?? 10_000,
    durationMinutes: partial.durationMinutes ?? 30,
  };
}

function day(date: string, extra: Partial<DayStatsRow> = {}): DayStatsRow {
  return {
    tenant: "t",
    date,
    totalDistanceMiles: extra.totalDistanceMiles ?? 12,
    modes: extra.modes ?? { car: 1 },
    clusters: extra.clusters ?? ["home"],
    visitCount: extra.visitCount ?? 1,
    activityCount: extra.activityCount ?? 1,
  };
}

describe("streakStats", () => {
  it("counts current, longest, and longest gap", () => {
    const stats = streakStats([
      "2024-01-01",
      "2024-01-02",
      "2024-01-03",
      "2024-01-10",
      "2024-01-11",
    ]);
    expect(stats.longest).toBe(3);
    expect(stats.current).toBe(2);
    expect(stats.longestGap).toBe(6);
    expect(stats.lastDate).toBe("2024-01-11");
  });
});

describe("computeStreaks", () => {
  it("reads consecutive allDates from the store", () => {
    const store = buildStore(
      [
        visit({ id: 1, date: "2024-06-01", start: "2024-06-01T10:00:00Z" }),
        visit({ id: 2, date: "2024-06-02", start: "2024-06-02T10:00:00Z" }),
      ],
      [],
      [day("2024-06-01"), day("2024-06-02")],
    );
    expect(computeStreaks(store)).toMatchObject({ current: 2, longest: 2, lastDate: "2024-06-02" });
  });
});

describe("computePlaceDeltas", () => {
  it("marks first-seen clusters as new and later returns as returned", () => {
    const store = buildStore(
      [
        visit({ id: 1, date: "2024-01-10", start: "2024-01-10T10:00:00Z", cluster: "cafe" }),
        visit({ id: 2, date: "2024-02-10", start: "2024-02-10T10:00:00Z", cluster: "park" }),
        visit({ id: 3, date: "2024-03-10", start: "2024-03-10T10:00:00Z", cluster: "cafe" }),
      ],
      [],
      [day("2024-01-10"), day("2024-02-10"), day("2024-03-10")],
    );
    const deltas = computePlaceDeltas(store);
    expect(deltas.find((m) => m.month === "2024-01")?.newClusters).toContain("cafe");
    expect(deltas.find((m) => m.month === "2024-02")?.newClusters).toContain("park");
    expect(deltas.find((m) => m.month === "2024-03")?.returnedClusters).toContain("cafe");
    expect(deltas.find((m) => m.month === "2024-03")?.newClusters).not.toContain("cafe");
  });
});

describe("computeLapsedPlaces", () => {
  it("lists clusters last seen more than a year before the latest date", () => {
    const store = buildStore(
      [
        visit({ id: 1, date: "2022-01-01", start: "2022-01-01T10:00:00Z", cluster: "old-cafe" }),
        visit({ id: 2, date: "2024-06-01", start: "2024-06-01T10:00:00Z", cluster: "home" }),
      ],
      [],
      [day("2022-01-01"), day("2024-06-01")],
    );
    const lapsed = computeLapsedPlaces(store);
    expect(lapsed[0]).toMatchObject({ cluster: "old-cafe", lastDate: "2022-01-01" });
    expect(lapsed[0].years).toBeGreaterThanOrEqual(2);
    expect(lapsed.some((p) => p.cluster === "home")).toBe(false);
  });
});

describe("computeHourOfWeek", () => {
  it("bins visit starts in UTC when no timezone is set", () => {
    const store = buildStore(
      [visit({ id: 1, date: "2024-06-03", start: "2024-06-03T23:30:00Z", cluster: "home" })],
      [],
      [day("2024-06-03")],
    );
    const grid = computeHourOfWeek(store);
    expect(grid).toHaveLength(7);
    expect(grid[0]).toHaveLength(24);
    expect(grid[1][23]).toBe(1);
  });

  it("shifts the bin into the tenant timezone", () => {
    const store = buildStore(
      [visit({ id: 1, date: "2024-06-03", start: "2024-06-03T23:30:00Z", cluster: "home" })],
      [],
      [day("2024-06-03")],
    );
    const grid = computeHourOfWeek(store, "America/New_York");
    expect(grid[1][19]).toBe(1);
    expect(grid[1][23]).toBe(0);
  });
});

describe("computePersonality", () => {
  it("tags walker when walking is at least 40% of distance", () => {
    const store = buildStore(
      [visit({ id: 1, date: "2024-06-01", start: "2024-06-01T10:00:00Z" })],
      [
        activity({
          id: 1,
          date: "2024-06-01",
          start: "2024-06-01T10:00:00Z",
          mode: "walking",
          distanceMeters: 50_000,
        }),
        activity({
          id: 2,
          date: "2024-06-01",
          start: "2024-06-01T12:00:00Z",
          mode: "car",
          distanceMeters: 10_000,
        }),
      ],
      [day("2024-06-01")],
    );
    expect(computePersonality(store).some((t) => t.id === "walker")).toBe(true);
  });

  it("tags flyer when flying outpaces driving and rail", () => {
    const store = buildStore(
      [visit({ id: 1, date: "2024-06-01", start: "2024-06-01T10:00:00Z" })],
      [
        activity({
          id: 1,
          date: "2024-06-01",
          start: "2024-06-01T10:00:00Z",
          mode: "flying",
          distanceMeters: 800_000,
        }),
        activity({
          id: 2,
          date: "2024-06-01",
          start: "2024-06-01T12:00:00Z",
          mode: "car",
          distanceMeters: 20_000,
        }),
      ],
      [day("2024-06-01")],
    );
    expect(computePersonality(store).some((t) => t.id === "flyer")).toBe(true);
  });

  it("tags creature_of_habit when the top three places cover most visits", () => {
    const visits = Array.from({ length: 10 }, (_, i) =>
      visit({
        id: i + 1,
        date: `2024-06-${String((i % 3) + 1).padStart(2, "0")}`,
        start: `2024-06-${String((i % 3) + 1).padStart(2, "0")}T10:00:00Z`,
        cluster: ["home", "work", "gym"][i % 3],
      }),
    );
    const store = buildStore(
      visits,
      [],
      [day("2024-06-01"), day("2024-06-02"), day("2024-06-03")],
    );
    expect(computePersonality(store).some((t) => t.id === "creature_of_habit")).toBe(true);
  });

  it("does not tag walker below the 40% threshold", () => {
    const store = buildStore(
      [visit({ id: 1, date: "2024-06-01", start: "2024-06-01T10:00:00Z" })],
      [
        activity({
          id: 1,
          date: "2024-06-01",
          start: "2024-06-01T10:00:00Z",
          mode: "walking",
          distanceMeters: 10_000,
        }),
        activity({
          id: 2,
          date: "2024-06-01",
          start: "2024-06-01T12:00:00Z",
          mode: "car",
          distanceMeters: 90_000,
        }),
      ],
      [day("2024-06-01")],
    );
    expect(computePersonality(store).some((t) => t.id === "walker")).toBe(false);
  });
});

describe("year chapters and facts", () => {
  it("includes firsts, trips, and streaks for the year", () => {
    const store = buildStore(
      [
        visit({
          id: 1,
          date: "2024-06-01",
          start: "2024-06-01T10:00:00Z",
          cluster: "London",
        }),
        visit({
          id: 2,
          date: "2024-06-01",
          start: "2024-06-01T18:00:00Z",
          cluster: "Paris",
          lat: 48.8,
          lon: 2.3,
        }),
        visit({
          id: 3,
          date: "2024-06-02",
          start: "2024-06-02T10:00:00Z",
          cluster: "Paris",
          lat: 48.8,
          lon: 2.3,
        }),
      ],
      [
        activity({
          id: 1,
          date: "2024-06-01",
          start: "2024-06-01T12:00:00Z",
          mode: "train",
        }),
      ],
      [
        day("2024-06-01", { clusters: ["London", "Paris"], modes: { train: 1 } }),
        day("2024-06-02", { clusters: ["Paris"] }),
      ],
    );
    const chapter = computeYearInReviewForYear(store, 2024);
    expect(chapter?.year).toBe(2024);
    expect(chapter?.firsts.some((f) => f.cluster === "London")).toBe(true);
    expect(chapter?.streaks.longest).toBeGreaterThanOrEqual(2);
    expect(chapter?.trips.length).toBeGreaterThanOrEqual(0);
  });

  it("adds boring Tuesday and longest stay without baking miles into the value", () => {
    const store = buildStore(
      [
        visit({
          id: 1,
          date: "2024-06-04",
          start: "2024-06-04T10:00:00Z",
          cluster: "library",
          durationMinutes: 400,
        }),
        visit({
          id: 2,
          date: "2024-06-11",
          start: "2024-06-11T10:00:00Z",
          cluster: "home",
          durationMinutes: 30,
        }),
      ],
      [
        activity({
          id: 1,
          date: "2024-06-04",
          start: "2024-06-04T12:00:00Z",
          distanceMeters: 1609,
        }),
      ],
      [
        day("2024-06-04", { totalDistanceMiles: 1, clusters: ["library"] }),
        day("2024-06-11", { totalDistanceMiles: 20, clusters: ["home"] }),
      ],
    );
    const facts = computeFunFacts(store);
    const tuesday = facts.find((f) => f.label === "Most boring Tuesday");
    expect(tuesday?.date).toBe("2024-06-04");
    expect(tuesday?.value.toLowerCase()).not.toContain("miles");
    const stay = facts.find((f) => f.label === "Longest stay without leaving");
    expect(stay?.value).toBe("library");
    expect(stay?.minutes).toBe(400);
    const withMiles = facts.filter((f) => f.miles != null);
    for (const fact of withMiles) {
      expect(fact.value.toLowerCase()).not.toMatch(/miles$/);
    }
  });
});

describe("computeAllAnalytics keys", () => {
  it("writes year chapters and storytelling keys", () => {
    const store = buildStore(
      [visit({ id: 1, date: "2024-06-01", start: "2024-06-01T10:00:00Z" })],
      [activity({ id: 1, date: "2024-06-01", start: "2024-06-01T12:00:00Z", mode: "walking" })],
      [day("2024-06-01", { modes: { walking: 1 } })],
    );
    const all = computeAllAnalytics(store, { timezone: "UTC" });
    expect(all.streaks).toMatchObject({ lastDate: "2024-06-01" });
    expect(Array.isArray(all["place-deltas"])).toBe(true);
    expect(Array.isArray(all["lapsed-places"])).toBe(true);
    expect(all["hour-of-week"]).toHaveLength(7);
    expect(Array.isArray(all.personality)).toBe(true);
    expect(all["year-in-review"]?.["2024"]?.year).toBe(2024);
    expect(all["year-in-review:2024"]).toMatchObject({ year: 2024 });
    expect(all.monthly[0].days_tracked).toBe(1);
    expect(all.yearly[0].mode_miles?.walking).toBeGreaterThan(0);
  });
});
