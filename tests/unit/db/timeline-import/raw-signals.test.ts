import { describe, expect, it } from "vitest";
import { detectStaysAndMoves, parseTimelineJson, type PathPoint } from "@locations/db";

const T0 = Date.UTC(2024, 5, 1, 8) / 1000;
/** `count` fixes a minute apart around one spot. */
const linger = (lat: number, lon: number, fromMin: number, count: number): PathPoint[] =>
  Array.from({ length: count }, (_, k) => [lat + (k % 2) * 0.0003, lon, T0 + (fromMin + k) * 60]);
/** A straight walk of `count` fixes from a to b. */
const travel = (a: [number, number], b: [number, number], fromMin: number, count: number): PathPoint[] =>
  Array.from({ length: count }, (_, k) => {
    const f = (k + 1) / (count + 1);
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, T0 + (fromMin + k) * 60];
  });

const home: [number, number] = [51.5, -0.1];
const work: [number, number] = [51.55, -0.1];
const day: PathPoint[] = [
  ...linger(...home, 0, 20),
  ...travel(home, work, 20, 15),
  ...linger(...work, 35, 30),
];

describe("detectStaysAndMoves", () => {
  it("finds two stays and the journey between them", () => {
    const records = detectStaysAndMoves(day);
    const visits = records.filter((r) => r.visit);
    const moves = records.filter((r) => r.activity);
    expect(visits).toHaveLength(2);
    expect(moves).toHaveLength(1);
    expect(Number(moves[0].activity?.distanceMeters)).toBeGreaterThan(5000);
    expect(records.some((r) => r.timelinePath?.length)).toBe(true);
  });

  it("ignores brief pauses and lone fixes", () => {
    expect(detectStaysAndMoves(linger(...home, 0, 5))).toEqual([]);
    expect(detectStaysAndMoves([])).toEqual([]);
  });

  it("merges a stay interrupted by a GPS blip", () => {
    const blip: PathPoint = [51.51, -0.1, T0 + 20 * 60];
    const records = detectStaysAndMoves([...linger(...home, 0, 15), blip, ...linger(...home, 21, 15)]);
    expect(records.filter((r) => r.visit)).toHaveLength(1);
  });
});

describe("Records.json", () => {
  it("imports stays and a journey with its GPS path", () => {
    const locations = day.map(([lat, lon, s]) => ({
      latitudeE7: Math.round(lat * 1e7),
      longitudeE7: Math.round(lon * 1e7),
      timestamp: new Date(s * 1000).toISOString(),
      accuracy: 20,
    }));
    const parsed = parseTimelineJson({ locations });
    expect(parsed.visits).toHaveLength(2);
    expect(parsed.activities).toHaveLength(1);
    expect(parsed.activities[0].path?.length).toBeGreaterThan(10);
    expect(parsed.visits.every((v) => v.durationMinutes >= 10)).toBe(true);
  });
});

describe("Timeline Edits raw signals", () => {
  it("become GPS paths for the edited journeys, not 2-minute stays", () => {
    const edits = [
      {
        inferredSemanticSegment: {
          startTime: new Date((T0 + 20 * 60) * 1000).toISOString(),
          endTime: new Date((T0 + 35 * 60) * 1000).toISOString(),
          segment: {
            activity: {
              start: { latE7: home[0] * 1e7, lngE7: home[1] * 1e7 },
              end: { latE7: work[0] * 1e7, lngE7: work[1] * 1e7 },
              topCandidate: { type: "IN_PASSENGER_VEHICLE" },
            },
          },
        },
      },
      ...travel(home, work, 20, 15).map(([lat, lon, s]) => ({
        rawSignal: {
          signal: {
            position: {
              point: { latE7: Math.round(lat * 1e7), lngE7: Math.round(lon * 1e7) },
              timestamp: new Date(s * 1000).toISOString(),
            },
          },
        },
      })),
    ];
    const parsed = parseTimelineJson({ timelineEdits: edits });
    expect(parsed.visits).toHaveLength(0);
    expect(parsed.activities).toHaveLength(1);
    expect(parsed.activities[0].path?.length).toBe(15);
  });
});
