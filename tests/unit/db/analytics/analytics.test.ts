import { describe, expect, it } from "vitest";
import { buildStore, detectDayTrips, groupMultiDayTrips, inferHomeWork } from "@locations/db";
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
    semanticType: "Unknown",
    placeId: null,
    durationMinutes: 60,
  };
}

function day(date: string, extra: Partial<DayStatsRow> = {}): DayStatsRow {
  return {
    tenant: "t",
    date,
    totalDistanceMiles: extra.totalDistanceMiles ?? 12,
    modes: extra.modes ?? { car: 1 },
    clusters: extra.clusters ?? ["home", "work"],
    visitCount: 2,
    activityCount: 1,
  };
}

describe("groupMultiDayTrips", () => {
  it("joins consecutive dates", () => {
    const store = buildStore(
      [
        visit({ id: 1, date: "2024-06-01", start: "2024-06-01T10:00:00Z", lat: 40, lon: -74 }),
        visit({ id: 2, date: "2024-06-01", start: "2024-06-01T18:00:00Z", lat: 41, lon: -74 }),
        visit({ id: 3, date: "2024-06-02", start: "2024-06-02T10:00:00Z", lat: 40, lon: -74 }),
        visit({ id: 4, date: "2024-06-02", start: "2024-06-02T18:00:00Z", lat: 41, lon: -74 }),
      ],
      [] as ActivityRow[],
      [day("2024-06-01"), day("2024-06-02")],
    );
    const trips = detectDayTrips(store);
    const grouped = groupMultiDayTrips(trips);
    expect(grouped.some((g) => g.dates.length >= 2)).toBe(true);
  });
});

describe("inferHomeWork", () => {
  it("guesses overnight cluster as home", () => {
    const store = buildStore(
      [
        visit({
          id: 10,
          date: "2024-06-03",
          start: "2024-06-03T23:30:00Z",
          cluster: "night-place",
          lat: 40.7,
          lon: -74,
        }),
        visit({
          id: 11,
          date: "2024-06-03",
          start: "2024-06-03T14:00:00Z",
          cluster: "day-place",
          lat: 40.8,
          lon: -74,
        }),
      ],
      [] as ActivityRow[],
      [day("2024-06-03", { clusters: ["night-place"], totalDistanceMiles: 0 })],
    );
    const guess = inferHomeWork(store);
    expect(guess.home?.cluster).toBe("night-place");
  });
});
