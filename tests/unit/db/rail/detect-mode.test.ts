import { describe, expect, it } from "vitest";
import {
  cleanTrace,
  detectJourneyMode,
  distanceToPolylineM,
  haversineM,
  RailIndex,
  snapTraceToRail,
  type DetectableJourney,
  type PathPoint,
  type RailCoverage,
  type RailTile,
} from "@locations/db";

// Synthetic rail: a gentle 10 km arc east of 51.50,-0.20 with a station at each end.
const arc = (t: number): [number, number] => [51.5 + 0.02 * Math.sin(Math.PI * t), -0.2 + 0.15 * t];
const railLine = Array.from({ length: 101 }, (_, i) => arc(i / 100));
const tile: RailTile = { v: 1, lines: [{ k: "rail", c: railLine }], stations: [railLine[0], railLine[100]] };
const coverage: RailCoverage = { v: 1, z: 10, built: "2026-10-23", bbox: [-1, 51, 1, 52], tiles: [] };
const rail = new RailIndex([tile], coverage);

const T0 = Date.parse("2024-05-01T08:00:00Z") / 1000;
/** Fixes along `at(t)`, `stepS` apart, with ~10 m of deterministic jitter. */
function fixes(at: (t: number) => [number, number], n: number, stepS: number): PathPoint[] {
  return Array.from({ length: n }, (_, i) => {
    const [lat, lon] = at((i + 1) / (n + 1));
    const j = ((i % 3) - 1) * 0.00008;
    return [lat + j, lon, T0 + (i + 1) * stepS];
  });
}
function journey(path: PathPoint[], mode = "car", stepS = 45): DetectableJourney {
  const n = path.length;
  const [sLat, sLon] = arc(0);
  const [eLat, eLon] = arc(1);
  return {
    mode,
    start: new Date(T0 * 1000).toISOString(),
    end: new Date((T0 + (n + 1) * stepS) * 1000).toISOString(),
    startLat: sLat,
    startLon: sLon,
    endLat: eLat,
    endLon: eLon,
    distanceMeters: 10_500,
    path,
  };
}

describe("detectJourneyMode", () => {
  it("relabels a 'car' journey whose fixes follow the railway at train speed", () => {
    const d = detectJourneyMode(journey(fixes(arc, 12, 45)), rail);
    expect(d).toMatchObject({ mode: "train", confidence: "high", by: "rail" });
    expect(d!.railPct).toBeGreaterThanOrEqual(95);
    expect(d!.avgKmh).toBeGreaterThan(50);
  });

  it("leaves a drive on a road 150 m from the tracks alone", () => {
    const road = (t: number): [number, number] => [arc(t)[0] + 0.00135, arc(t)[1]];
    expect(detectJourneyMode(journey(fixes(road, 12, 45)), rail)).toBeNull();
  });

  it("does not call a slow trip beside the tracks a train", () => {
    const d = detectJourneyMode(journey(fixes(arc, 12, 900), "car", 900), rail);
    expect(d?.mode).not.toBe("train");
    expect(d?.mode).toBe("walking");
  });

  it("only uses speed checks outside the rail map", () => {
    const elsewhere = new RailIndex([tile], { ...coverage, bbox: [10, 40, 11, 41] });
    expect(detectJourneyMode(journey(fixes(arc, 12, 45)), elsewhere)).toBeNull();
    expect(detectJourneyMode(journey(fixes(arc, 12, 45)), null)).toBeNull();
  });

  it("ignores tram track, which shares streets with cars", () => {
    const tram = new RailIndex([{ ...tile, lines: [{ k: "tram", c: railLine }] }], coverage);
    expect(detectJourneyMode(journey(fixes(arc, 12, 45)), tram)).toBeNull();
  });

  it("keeps Google's label when it already says train", () => {
    expect(detectJourneyMode(journey(fixes(arc, 12, 45), "train"), rail)).toBeNull();
  });

  it("fixes walking that moved at cycling speed, and drives at airliner speed", () => {
    const walk = detectJourneyMode(journey(fixes(arc, 12, 180), "walking", 180), null);
    expect(walk).toMatchObject({ mode: "cycling", by: "speed" });
    const far = (t: number): [number, number] => [51.5 + 3 * t, -0.2];
    const flight = { ...journey(fixes(far, 8, 120)), endLat: 54.5, endLon: -0.2, distanceMeters: 333_000 };
    expect(detectJourneyMode(flight, null)).toMatchObject({ mode: "flying" });
  });
});

describe("cleanTrace", () => {
  it("drops a single GPS spike and keeps both ends", () => {
    const t: PathPoint[] = [
      [51.5, -0.2, 0],
      [51.501, -0.199, 60],
      [51.6, -0.1, 65],
      [51.502, -0.198, 120],
      [51.503, -0.197, 180],
    ];
    const out = cleanTrace(t);
    expect(out.map((p) => p[2])).toEqual([0, 60, 120, 180]);
  });
});

describe("snapTraceToRail", () => {
  it("follows the curve of the tracks between sparse fixes", () => {
    const sparse = fixes(arc, 4, 120);
    const line = snapTraceToRail(sparse, rail)!;
    expect(line.length).toBeGreaterThan(sparse.length * 3);
    for (const p of line) expect(distanceToPolylineM(p[0], p[1], railLine)).toBeLessThan(5);
  });

  it("joins ways that do not share a point at the junction", () => {
    const a = railLine.slice(0, 51);
    const b = railLine.slice(50).map(([lat, lon], i) => (i === 0 ? ([lat + 0.00012, lon] as [number, number]) : [lat, lon] as [number, number]));
    const split = new RailIndex([{ v: 1, lines: [{ k: "rail", c: a }, { k: "rail", c: b }], stations: [] }], coverage);
    const line = snapTraceToRail(fixes(arc, 4, 120), split)!;
    expect(line).not.toBeNull();
    const longestHop = Math.max(...line.slice(1).map((p, i) => haversineM(line[i][0], line[i][1], p[0], p[1])));
    expect(longestHop).toBeLessThan(400);
  });

  it("returns null when the fixes are nowhere near rail", () => {
    const road = (t: number): [number, number] => [arc(t)[0] + 0.01, arc(t)[1]];
    expect(snapTraceToRail(fixes(road, 6, 60), rail)).toBeNull();
  });
});
