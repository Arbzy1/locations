import { describe, expect, it } from "vitest";
import {
  distanceToPolylineM,
  journeyAccuracy,
  sampleAlongTrace,
  traceDeviation,
  type PathPoint,
} from "@locations/db";

// A north-south line along lon -74.0 from 40.70 to 40.75 (~5.5 km).
const line: [number, number][] = [
  [40.7, -74.0],
  [40.75, -74.0],
];

describe("distanceToPolylineM", () => {
  it("measures perpendicular distance to the nearest segment", () => {
    // 0.001 deg longitude at 40.7N is about 84 m.
    expect(distanceToPolylineM(40.72, -73.999, line)).toBeGreaterThan(80);
    expect(distanceToPolylineM(40.72, -73.999, line)).toBeLessThan(90);
    expect(distanceToPolylineM(40.72, -74.0, line)).toBeLessThan(1);
  });

  it("measures to the endpoint beyond the segment", () => {
    expect(distanceToPolylineM(40.76, -74.0, line)).toBeGreaterThan(1000);
  });
});

describe("traceDeviation", () => {
  it("summarises how far fixes sit from a line", () => {
    const fixes: [number, number][] = [
      [40.71, -74.0],
      [40.72, -73.999],
      [40.73, -73.99],
    ];
    const dev = traceDeviation(fixes, line)!;
    expect(dev.within100Pct).toBe(67);
    expect(dev.maxM).toBeGreaterThan(800);
    expect(dev.medianM).toBeGreaterThan(80);
  });

  it("returns null without fixes or a line", () => {
    expect(traceDeviation([], line)).toBeNull();
    expect(traceDeviation([[40.7, -74]], [[40.7, -74]])).toBeNull();
  });
});

describe("sampleAlongTrace", () => {
  it("spaces samples evenly and respects the cap", () => {
    const samples = sampleAlongTrace(line, 1000, 3);
    expect(samples).toHaveLength(3);
    expect(samples[0][0]).toBeGreaterThan(40.7);
    expect(samples[2][0]).toBeLessThan(40.75);
    expect(samples[1][0]).toBeGreaterThan(samples[0][0]);
  });

  it("returns nothing for short traces", () => {
    expect(sampleAlongTrace(line, 10_000, 5)).toEqual([]);
  });
});

describe("journeyAccuracy", () => {
  const start = 1_000_000;
  const dense: PathPoint[] = [1, 2, 3, 4].map((i) => [40.7 + i * 0.01, -74.0, start + i * 240]);

  it("rates dense fixes on the drawn line as high", () => {
    const acc = journeyAccuracy({ path: dense, startS: start, endS: start + 1200, drawnLine: line });
    expect(acc.score).toBe("high");
    expect(acc.fixes).toBe(4);
    expect(acc.meanOffsetM).toBeLessThan(5);
  });

  it("rates long gaps as low", () => {
    const sparse: PathPoint[] = [[40.71, -74.0, start + 60]];
    expect(journeyAccuracy({ path: sparse, startS: start, endS: start + 3600, drawnLine: line }).score).toBe("low");
  });

  it("rates journeys without fixes as low", () => {
    expect(journeyAccuracy({ path: null, startS: start, endS: start + 600, drawnLine: line })).toMatchObject({
      score: "low",
      fixes: 0,
      meanOffsetM: null,
    });
  });
});
