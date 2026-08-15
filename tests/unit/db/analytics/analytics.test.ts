import { describe, expect, it } from "vitest";
import {
  buildStore,
  computeFunFacts,
  computeYearlyStats,
  detectDayTrips,
  detectFlights,
  detectLowMovementDays,
  detectTrainHops,
  groupMultiDayTrips,
  inferHomeWork,
  splitDriveTransitMiles,
  tripNameFromClusters,
  computeAwayNights,
  computeFirsts,
  computeDataHealth,
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
    durationMinutes: 60,
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
    clusters: extra.clusters ?? ["home", "work"],
    visitCount: extra.visitCount ?? 2,
    activityCount: extra.activityCount ?? 1,
  };
}

describe("groupMultiDayTrips", () => {
  it("joins consecutive dates with a name and modes", () => {
    const store = buildStore(
      [
        visit({
          id: 1,
          date: "2024-06-01",
          start: "2024-06-01T10:00:00Z",
          lat: 40,
          lon: -74,
          cluster: "London",
        }),
        visit({
          id: 2,
          date: "2024-06-01",
          start: "2024-06-01T18:00:00Z",
          lat: 41,
          lon: -74,
          cluster: "Paris",
        }),
        visit({
          id: 3,
          date: "2024-06-02",
          start: "2024-06-02T10:00:00Z",
          lat: 40,
          lon: -74,
          cluster: "Paris",
        }),
        visit({
          id: 4,
          date: "2024-06-02",
          start: "2024-06-02T18:00:00Z",
          lat: 41,
          lon: -74,
          cluster: "Rome",
        }),
      ],
      [
        activity({
          id: 1,
          date: "2024-06-01",
          start: "2024-06-01T12:00:00Z",
          mode: "train",
        }),
        activity({
          id: 2,
          date: "2024-06-02",
          start: "2024-06-02T12:00:00Z",
          mode: "car",
        }),
      ],
      [
        day("2024-06-01", { clusters: ["London", "Paris"], modes: { train: 1 } }),
        day("2024-06-02", { clusters: ["Paris", "Rome"], modes: { car: 1 } }),
      ],
    );
    const trips = detectDayTrips(store);
    const grouped = groupMultiDayTrips(trips);
    expect(grouped.some((g) => g.dates.length >= 2)).toBe(true);
    const trip = grouped.find((g) => g.start === "2024-06-01");
    expect(trip?.name).toBe("London to Rome");
    expect(trip?.modes).toEqual(expect.arrayContaining(["train", "car"]));
  });
});

describe("tripNameFromClusters", () => {
  it("ignores grid cells and collapses a matching start and end", () => {
    expect(tripNameFromClusters(["home", "51.5°N 0.0°W"], ["home"])).toBe("home");
    expect(tripNameFromClusters(["51.5°N 0.0°W"], ["51.5°N 0.1°E"])).toBe("Trip");
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

describe("detectFlights", () => {
  it("counts tagged flying and guesses long or fast legs", () => {
    const store = buildStore(
      [visit({ id: 1, date: "2024-07-01", start: "2024-07-01T10:00:00Z" })],
      [
        activity({
          id: 1,
          date: "2024-07-01",
          start: "2024-07-01T08:00:00Z",
          mode: "flying",
          distanceMeters: 800_000,
          durationMinutes: 90,
        }),
        activity({
          id: 2,
          date: "2024-07-01",
          start: "2024-07-01T12:00:00Z",
          mode: "car",
          distanceMeters: 500_000,
          durationMinutes: 60,
        }),
        activity({
          id: 3,
          date: "2024-07-01",
          start: "2024-07-01T16:00:00Z",
          mode: "car",
          distanceMeters: 50_000,
          durationMinutes: 60,
        }),
      ],
      [day("2024-07-01")],
    );
    const flights = detectFlights(store);
    expect(flights.tagged).toBe(1);
    expect(flights.guessed).toBe(1);
    expect(flights.taggedMiles).toBeGreaterThan(0);
    expect(flights.guessedMiles).toBeGreaterThan(0);
  });
});

describe("detectTrainHops", () => {
  it("labels consecutive train legs from nearby stations", () => {
    const store = buildStore(
      [
        visit({
          id: 1,
          date: "2024-08-01",
          start: "2024-08-01T09:00:00Z",
          cluster: "King's Cross",
          semanticType: "Train Station",
          lat: 51.53,
          lon: -0.12,
        }),
        visit({
          id: 2,
          date: "2024-08-01",
          start: "2024-08-01T12:00:00Z",
          cluster: "Edinburgh Waverley",
          semanticType: "Transit Station",
          lat: 55.95,
          lon: -3.19,
        }),
      ],
      [
        activity({
          id: 1,
          date: "2024-08-01",
          start: "2024-08-01T09:10:00Z",
          end: "2024-08-01T10:00:00Z",
          mode: "train",
          startLat: 51.53,
          startLon: -0.12,
          endLat: 53.0,
          endLon: -1.5,
          distanceMeters: 200_000,
        }),
        activity({
          id: 2,
          date: "2024-08-01",
          start: "2024-08-01T10:05:00Z",
          end: "2024-08-01T12:00:00Z",
          mode: "train",
          startLat: 53.0,
          startLon: -1.5,
          endLat: 55.95,
          endLon: -3.19,
          distanceMeters: 250_000,
        }),
      ],
      [day("2024-08-01", { clusters: ["King's Cross", "Edinburgh Waverley"] })],
    );
    const hops = detectTrainHops(store);
    expect(hops).toHaveLength(1);
    expect(hops[0].from).toBe("King's Cross");
    expect(hops[0].to).toBe("Edinburgh Waverley");
    expect(hops[0].hops).toBe(2);
  });

  it("ignores a lone train leg", () => {
    const store = buildStore(
      [
        visit({
          id: 1,
          date: "2024-08-02",
          start: "2024-08-02T09:00:00Z",
          cluster: "Paddington",
          semanticType: "Train Station",
        }),
      ],
      [
        activity({
          id: 1,
          date: "2024-08-02",
          start: "2024-08-02T09:10:00Z",
          mode: "car",
        }),
        activity({
          id: 2,
          date: "2024-08-02",
          start: "2024-08-02T10:00:00Z",
          mode: "train",
        }),
        activity({
          id: 3,
          date: "2024-08-02",
          start: "2024-08-02T12:00:00Z",
          mode: "car",
        }),
      ],
      [day("2024-08-02")],
    );
    expect(detectTrainHops(store)).toEqual([]);
  });
});

describe("splitDriveTransitMiles", () => {
  it("splits car from bus/train/subway and ignores walk", () => {
    const split = splitDriveTransitMiles([
      { mode: "car", distanceMeters: 16_093.4 },
      { mode: "train", distanceMeters: 8_046.7 },
      { mode: "walking", distanceMeters: 5_000 },
      { mode: "flying", distanceMeters: 400_000 },
    ]);
    expect(split.drive_miles).toBeCloseTo(10, 0);
    expect(split.transit_miles).toBeCloseTo(5, 0);
  });
});

describe("computeYearlyStats", () => {
  it("adds drive and transit miles for the year", () => {
    const store = buildStore(
      [visit({ id: 1, date: "2024-03-01", start: "2024-03-01T10:00:00Z" })],
      [
        activity({
          id: 1,
          date: "2024-03-01",
          start: "2024-03-01T11:00:00Z",
          mode: "car",
          distanceMeters: 16_093.4,
        }),
        activity({
          id: 2,
          date: "2024-03-01",
          start: "2024-03-01T15:00:00Z",
          mode: "bus",
          distanceMeters: 8_046.7,
        }),
      ],
      [day("2024-03-01", { modes: { car: 1, bus: 1 } })],
    );
    const yearly = computeYearlyStats(store);
    expect(yearly[0].drive_miles).toBeCloseTo(10, 0);
    expect(yearly[0].transit_miles).toBeCloseTo(5, 0);
  });
});

describe("computeFunFacts extra travel facts", () => {
  it("reports longest day, most stops, and farthest from home", () => {
    const store = buildStore(
      [
        visit({
          id: 1,
          date: "2024-05-01",
          start: "2024-05-01T23:30:00Z",
          cluster: "home",
          lat: 40.7,
          lon: -74,
        }),
        visit({
          id: 2,
          date: "2024-05-02",
          start: "2024-05-02T10:00:00Z",
          cluster: "home",
          lat: 40.7,
          lon: -74,
        }),
        visit({
          id: 3,
          date: "2024-05-02",
          start: "2024-05-02T12:00:00Z",
          cluster: "cafe",
          lat: 40.71,
          lon: -74.01,
        }),
        visit({
          id: 4,
          date: "2024-05-02",
          start: "2024-05-02T14:00:00Z",
          cluster: "park",
          lat: 40.72,
          lon: -74.02,
        }),
        visit({
          id: 5,
          date: "2024-05-03",
          start: "2024-05-03T10:00:00Z",
          cluster: "far-city",
          lat: 51.5,
          lon: -0.1,
        }),
      ],
      [] as ActivityRow[],
      [
        day("2024-05-01", { clusters: ["home"], totalDistanceMiles: 1, visitCount: 1 }),
        day("2024-05-02", {
          clusters: ["home", "cafe", "park"],
          totalDistanceMiles: 4,
          visitCount: 3,
        }),
        day("2024-05-03", { clusters: ["far-city"], totalDistanceMiles: 40, visitCount: 1 }),
      ],
    );
    const facts = computeFunFacts(store);
    expect(facts.find((f) => f.label === "Longest Day")?.date).toBe("2024-05-03");
    expect(facts.find((f) => f.label === "Most Stops")?.date).toBe("2024-05-02");
    expect(facts.find((f) => f.label === "Farthest from Home")?.value).toBe("far-city");
    expect(facts.find((f) => f.label === "Farthest from Home")?.miles).toBeGreaterThan(100);
  });
});

describe("detectLowMovementDays", () => {
  it("includes a stay-put day and skips a travel day", () => {
    const store = buildStore(
      [
        visit({
          id: 1,
          date: "2024-09-01",
          start: "2024-09-01T10:00:00Z",
          cluster: "home",
          lat: 40.7,
          lon: -74,
        }),
        visit({
          id: 2,
          date: "2024-09-01",
          start: "2024-09-01T18:00:00Z",
          cluster: "home",
          lat: 40.701,
          lon: -74.001,
        }),
        visit({
          id: 3,
          date: "2024-09-02",
          start: "2024-09-02T10:00:00Z",
          cluster: "home",
          lat: 40.7,
          lon: -74,
        }),
        visit({
          id: 4,
          date: "2024-09-02",
          start: "2024-09-02T18:00:00Z",
          cluster: "other-city",
          lat: 41.5,
          lon: -74,
        }),
      ],
      [] as ActivityRow[],
      [
        day("2024-09-01", { clusters: ["home"], totalDistanceMiles: 0.4 }),
        day("2024-09-02", { clusters: ["home", "other-city"], totalDistanceMiles: 80 }),
      ],
    );
    const days = detectLowMovementDays(store);
    expect(days.map((d) => d.date)).toEqual(["2024-09-01"]);
    expect(days[0].clusters).toEqual(["home"]);
  });
});

describe("computeAwayNights", () => {
  it("lists overnight clusters that are not the home guess", () => {
    const store = buildStore(
      [
        visit({
          id: 1,
          date: "2024-06-03",
          start: "2024-06-03T23:30:00Z",
          cluster: "home",
        }),
        visit({
          id: 2,
          date: "2024-06-04",
          start: "2024-06-04T23:30:00Z",
          cluster: "hotel",
        }),
      ],
      [] as ActivityRow[],
      [day("2024-06-03", { clusters: ["home"] }), day("2024-06-04", { clusters: ["hotel"] })],
    );
    const nights = computeAwayNights(store);
    expect(nights.some((n) => n.cluster === "hotel")).toBe(true);
  });
});

describe("computeFirsts", () => {
  it("records the first date per cluster", () => {
    const store = buildStore(
      [
        visit({ id: 1, date: "2024-01-01", start: "2024-01-01T10:00:00Z", cluster: "cafe" }),
        visit({ id: 2, date: "2024-02-01", start: "2024-02-01T10:00:00Z", cluster: "cafe" }),
      ],
      [] as ActivityRow[],
      [day("2024-01-01"), day("2024-02-01")],
    );
    expect(computeFirsts(store).clusters[0]).toEqual({ name: "cafe", date: "2024-01-01" });
  });
});

describe("computeDataHealth", () => {
  it("counts duplicate visits", () => {
    const store = buildStore(
      [
        visit({ id: 1, date: "2024-01-01", start: "2024-01-01T10:00:00Z", cluster: "home", lat: 1, lon: 2 }),
        visit({ id: 2, date: "2024-01-01", start: "2024-01-01T10:00:00Z", cluster: "home", lat: 1, lon: 2 }),
      ],
      [] as ActivityRow[],
      [day("2024-01-01")],
    );
    expect(computeDataHealth(store).duplicateVisits).toBe(1);
  });
});
