import { describe, expect, it } from "vitest";
import {
  IMPORT_BATCH_ROWS,
  checkActivity,
  checkAggregateWrite,
  checkMemories,
  checkRowBatch,
  checkVisit,
} from "@locations/api/import-session";

const stay = {
  start: "2024-06-01T08:00:00Z",
  end: "2024-06-01T09:00:00Z",
  date: "2024-06-01",
  lat: 51.5,
  lon: -0.1,
  cluster: "51.5°N 0.0°W",
  semanticType: "Home",
  placeId: "ChIJabc",
  durationMinutes: 60,
  fixLat: null,
  fixLon: null,
  fixCount: null,
  placeKey: "g:ChIJabc",
  googleName: null,
};
const trip = {
  start: "2024-06-01T09:00:00Z",
  end: "2024-06-01T09:30:00Z",
  date: "2024-06-01",
  startLat: 51.5,
  startLon: -0.1,
  endLat: 51.52,
  endLon: -0.12,
  mode: "car",
  distanceMeters: 4200,
  durationMinutes: 30,
  path: [[51.51, -0.11, 1717232700]],
};

describe("row validation", () => {
  it("accepts well-formed stays and journeys and copies only known fields", () => {
    const v = checkVisit({ ...stay, tenant: "someone-else", id: 99, role: "admin" });
    expect(v.ok).toBe(true);
    expect(v.ok && Object.keys(v.value)).not.toContain("tenant");
    expect(v.ok && Object.keys(v.value)).not.toContain("id");
    const a = checkActivity({ ...trip, sourceId: "x" });
    expect(a.ok && a.value.path).toEqual([[51.51, -0.11, 1717232700]]);
    expect(a.ok && Object.keys(a.value)).not.toContain("sourceId");
  });

  it("rejects out-of-range or malformed values", () => {
    expect(checkVisit({ ...stay, lat: 91 }).ok).toBe(false);
    expect(checkVisit({ ...stay, date: "01/06/2024" }).ok).toBe(false);
    expect(checkVisit({ ...stay, start: "yesterday" }).ok).toBe(false);
    expect(checkVisit({ ...stay, fixCount: 2.5 }).ok).toBe(false);
    expect(checkVisit({ ...stay, cluster: "x".repeat(81) }).ok).toBe(false);
    expect(checkActivity({ ...trip, mode: "teleport" }).ok).toBe(false);
    expect(checkActivity({ ...trip, path: Array.from({ length: 301 }, () => [51, 0, 1]) }).ok).toBe(false);
    expect(checkActivity({ ...trip, path: [[51, 0]] }).ok).toBe(false);
  });

  it("caps a batch and names the bad row", () => {
    expect(checkRowBatch({ visits: [] }).ok).toBe(false);
    expect(checkRowBatch({ visits: Array.from({ length: IMPORT_BATCH_ROWS + 1 }, () => stay) }).ok).toBe(false);
    const bad = checkRowBatch({ visits: [stay, { ...stay, lon: 999 }] });
    expect(!bad.ok && bad.error).toMatch(/^visits\[1\]/);
    expect(checkRowBatch({ visits: [stay], activities: [trip] }).ok).toBe(true);
  });

  it("validates trips from Timeline memories", () => {
    expect(checkMemories(undefined)).toEqual({ ok: true, value: [] });
    expect(checkMemories([{ start: trip.start, end: trip.end, distanceKm: 202 }]).ok).toBe(true);
    expect(checkMemories([{ start: "x", end: trip.end }]).ok).toBe(false);
  });
});

describe("aggregate write validation", () => {
  const day = {
    date: "2024-06-01",
    totalDistanceMiles: 3.2,
    modes: { car: 1 },
    clusters: ["a"],
    visitCount: 2,
    activityCount: 1,
  };

  it("accepts day rows and analytics entries", () => {
    const ok = checkAggregateWrite({ reset: true, dayStats: [day], analytics: { monthly: [], "year-in-review:2024": {} } });
    expect(ok.ok && ok.value).toMatchObject({ reset: true, done: false });
    expect(ok.ok && ok.value.analytics.map(([k]) => k)).toEqual(["monthly", "year-in-review:2024"]);
  });

  it("rejects bad keys, the stale marker, oversized entries and bad rows", () => {
    expect(checkAggregateWrite({ analytics: { "../evil": 1 } }).ok).toBe(false);
    expect(checkAggregateWrite({ analytics: { _aggregates_stale: {} } }).ok).toBe(false);
    expect(checkAggregateWrite({ analytics: { big: "x".repeat(800 * 1024) } }).ok).toBe(false);
    expect(checkAggregateWrite({ dayStats: [{ ...day, visitCount: 1.5 }] }).ok).toBe(false);
    expect(checkAggregateWrite({ dayStats: [{ ...day, date: "June" }] }).ok).toBe(false);
  });
});
