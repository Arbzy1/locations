import { describe, expect, it } from "vitest";
import {
  attachPathPoints,
  attachVisitFixes,
  MAX_PATH_POINTS,
  parseTimelineJson,
  pathPointsFromRecord,
  type PathPoint,
} from "@locations/db";
import { loadTimelineFixture } from "@tests/helpers/fixtures";

const at = (iso: string) => Date.parse(iso) / 1000;

describe("timelinePath import", () => {
  it("attaches GPS fixes recorded during a journey and skips fixes at stops", () => {
    const parsed = parseTimelineJson(loadTimelineFixture("classic-with-path.json"));
    expect(parsed.visits).toHaveLength(2);
    expect(parsed.activities).toHaveLength(1);
    const path = parsed.activities[0].path;
    expect(path?.map((p) => p[2])).toEqual([
      at("2024-06-01T09:00:00Z"),
      at("2024-06-01T09:10:00Z"),
      at("2024-06-01T09:20:00Z"),
      at("2024-06-01T09:20:00Z"),
      at("2024-06-01T09:30:00Z"),
    ]);
    // Same-minute fixes keep their recorded order; exact repeats are dropped.
    expect(path?.[2].slice(0, 2)).toEqual([40.74, -73.992]);
    expect(path?.[3].slice(0, 2)).toEqual([40.745, -73.99]);
  });

  it("reads semanticSegments timelinePath with ISO times and degree coordinates", () => {
    const parsed = parseTimelineJson({
      semanticSegments: [
        {
          startTime: "2024-06-02T09:00:00.000Z",
          endTime: "2024-06-02T09:20:00.000Z",
          activity: {
            start: { latLng: "40.7128°, -74.0060°" },
            end: { latLng: "40.7300°, -73.9950°" },
            distanceMeters: 2500,
            topCandidate: { type: "IN_PASSENGER_VEHICLE" },
          },
        },
        {
          startTime: "2024-06-02T09:00:00.000Z",
          endTime: "2024-06-02T11:00:00.000Z",
          timelinePath: [
            { point: "40.7200°, -74.0010°", time: "2024-06-02T09:05:00.000Z" },
            { point: "40.7250°, -73.9980°", time: "2024-06-02T09:10:00.000Z" },
            { point: "40.7400°, -73.9900°", time: "2024-06-02T10:30:00.000Z" },
          ],
        },
      ],
    });
    expect(parsed.activities).toHaveLength(1);
    expect(parsed.activities[0].mode).toBe("car");
    expect(parsed.activities[0].path).toEqual([
      [40.72, -74.001, at("2024-06-02T09:05:00Z")],
      [40.725, -73.998, at("2024-06-02T09:10:00Z")],
    ]);
  });

  it("leaves journeys without fixes as null", () => {
    const parsed = parseTimelineJson(loadTimelineFixture("classic-array.json"));
    expect(parsed.activities.every((a) => a.path === null)).toBe(true);
  });

  it("ignores malformed path entries", () => {
    const points = pathPointsFromRecord({
      startTime: "2024-06-01T08:00:00.000Z",
      timelinePath: [
        { point: "not-a-point", durationMinutesOffsetFromStartTime: "1" },
        { point: "geo:40.7,-74.0" },
        { point: "geo:40.7,-74.0", durationMinutesOffsetFromStartTime: "abc" },
        { point: "geo:40.7,-74.0", durationMinutesOffsetFromStartTime: 5 },
      ],
    });
    expect(points).toEqual([[40.7, -74, at("2024-06-01T08:05:00Z")]]);
  });

  it("caps very long journeys and keeps both ends", () => {
    const start = at("2024-06-01T00:00:00Z");
    const points: PathPoint[] = Array.from({ length: 1000 }, (_, i) => [
      40 + i * 0.001,
      -74,
      start + i * 10,
    ]);
    const rows = [
      { start: "2024-06-01T00:00:00.000Z", end: "2024-06-01T03:00:00.000Z", path: null as PathPoint[] | null },
    ];
    attachPathPoints(rows, points);
    expect(rows[0].path).toHaveLength(MAX_PATH_POINTS);
    expect(rows[0].path?.[0]).toEqual(points[0]);
    expect(rows[0].path?.at(-1)).toEqual(points.at(-1));
  });
});

describe("attachVisitFixes", () => {
  it("pins stays to the median of nearby GPS fixes recorded during them", () => {
    const parsed = parseTimelineJson(loadTimelineFixture("classic-with-path.json"));
    const [home, work] = parsed.visits;
    expect(home.fixCount).toBe(2);
    expect(home.fixLat).toBeCloseTo((40.7128 + 40.72) / 2, 5);
    expect(work.fixCount).toBe(2);
    expect(work.fixLon).toBeCloseTo((-73.986 + -73.9855) / 2, 5);
  });

  it("ignores far-away fixes and stays with fewer than two fixes", () => {
    const rows = [
      { start: "2024-06-01T08:00:00.000Z", end: "2024-06-01T09:00:00.000Z", lat: 40.7, lon: -74, fixLat: null, fixLon: null, fixCount: null },
    ];
    const t = Date.parse("2024-06-01T08:10:00Z") / 1000;
    const fixed = attachVisitFixes(rows, [
      [40.7001, -74, t],
      [41.5, -74, t + 60],
    ]);
    expect(fixed).toBe(0);
    expect(rows[0].fixCount).toBeNull();
  });
});

