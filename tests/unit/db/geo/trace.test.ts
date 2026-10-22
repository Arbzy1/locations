import { describe, expect, it } from "vitest";
import {
  journeyTrace,
  makeTraceCacheKey,
  polylineLengthM,
  thinTrace,
  type PathPoint,
} from "@locations/db";

const journey = {
  start: "2024-06-01T09:00:00.000Z",
  end: "2024-06-01T09:30:00.000Z",
  startLat: 40.7128,
  startLon: -74.006,
  endLat: 40.758,
  endLon: -73.9855,
};
const t0 = Date.parse(journey.start) / 1000;

describe("journeyTrace", () => {
  it("returns null without recorded fixes", () => {
    expect(journeyTrace({ ...journey, path: null })).toBeNull();
    expect(journeyTrace({ ...journey, path: [] })).toBeNull();
  });

  it("wraps fixes with the journey start and end in time order", () => {
    const trace = journeyTrace({ ...journey, path: [[40.73, -73.995, t0 + 600]] });
    expect(trace).toEqual([
      [40.7128, -74.006, t0],
      [40.73, -73.995, t0 + 600],
      [40.758, -73.9855, t0 + 1800],
    ]);
  });
});

describe("thinTrace", () => {
  it("drops jitter closer than the spacing but keeps both ends", () => {
    const trace: PathPoint[] = [
      [40.7, -74, 0],
      [40.70001, -74, 10],
      [40.71, -74, 20],
      [40.71001, -74, 30],
    ];
    expect(thinTrace(trace, { minSpacingM: 40, maxPoints: 10 })).toEqual([
      [40.7, -74, 0],
      [40.71001, -74, 30],
    ]);
  });

  it("samples down to maxPoints", () => {
    const trace: PathPoint[] = Array.from({ length: 100 }, (_, i) => [40 + i * 0.01, -74, i]);
    const thinned = thinTrace(trace, { minSpacingM: 40, maxPoints: 10 });
    expect(thinned).toHaveLength(10);
    expect(thinned[0]).toEqual(trace[0]);
    expect(thinned.at(-1)).toEqual(trace.at(-1));
  });
});

describe("polylineLengthM", () => {
  it("sums segment lengths", () => {
    expect(polylineLengthM([[0, 0], [0, 0.01], [0, 0.02]])).toBeCloseTo(2224, -1);
  });
});

describe("makeTraceCacheKey", () => {
  it("is stable, profile-specific, and does not spell out coordinates", () => {
    const trace: PathPoint[] = [
      [40.7128, -74.006, 1],
      [40.758, -73.9855, 2],
    ];
    const key = makeTraceCacheKey(trace, "driving");
    expect(key).toBe(makeTraceCacheKey([[40.7128, -74.006, 99], [40.758, -73.9855, 100]], "driving"));
    expect(key).not.toBe(makeTraceCacheKey(trace, "foot"));
    expect(key).toMatch(/^trace:driving:2:[0-9a-f]{16}$/);
    expect(key).not.toContain("40.7");
  });
});
