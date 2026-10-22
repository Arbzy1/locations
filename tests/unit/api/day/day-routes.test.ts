import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  activities,
  dayStats,
  placeCache,
  visits,
  type ActivityRow,
  type VisitRow,
} from "@locations/db";
import { getDay } from "@locations/api/services";

const DATE = "2024-06-01";

function visit(id: number, start: string, end: string, lat: number, lon: number): VisitRow {
  return {
    id,
    tenant: "t1",
    sourceId: "s1",
    start: `${DATE}T${start}:00.000Z`,
    end: `${DATE}T${end}:00.000Z`,
    date: DATE,
    lat,
    lon,
    cluster: `Area ${id}`,
    semanticType: "Unknown",
    placeId: null,
    durationMinutes: 60,
    fixLat: null,
    fixLon: null,
    fixCount: null,
  };
}

function journey(
  id: number,
  start: string,
  end: string,
  from: [number, number],
  to: [number, number],
): ActivityRow {
  return {
    id,
    tenant: "t1",
    sourceId: "s1",
    start: `${DATE}T${start}:00.000Z`,
    end: `${DATE}T${end}:00.000Z`,
    date: DATE,
    startLat: from[0],
    startLon: from[1],
    endLat: to[0],
    endLon: to[1],
    mode: "car",
    distanceMeters: 5600,
    durationMinutes: 30,
    path: null,
  };
}

/** Fake Drizzle that answers each table with the rows for DATE. */
function dayDb(v: VisitRow[], a: ActivityRow[]) {
  const rowsFor = (table: unknown): unknown[] => {
    if (table === dayStats) {
      return [{ tenant: "t1", date: DATE, totalDistanceMiles: 3.5, modes: { car: a.length }, clusters: [], visitCount: v.length, activityCount: a.length }];
    }
    if (table === visits) return v;
    if (table === activities) return a;
    if (table === placeCache) return [{ name: "Place", address: "", data: {} }];
    return [];
  };
  const query = (rows: unknown[]) => {
    // Awaitable after where() too, like a Drizzle query builder.
    const q = {
      where: () => q,
      orderBy: async () => rows,
      limit: async () => rows,
      then: (resolve: (r: unknown[]) => unknown) => resolve(rows),
    };
    return q;
  };
  return {
    select: () => ({ from: (table: unknown) => query(rowsFor(table)) }),
    insert: () => ({ values: () => ({ onConflictDoUpdate: async () => undefined }) }),
  } as never;
}

type DayResult = {
  visits: Array<{ lat: number; lon: number; place_lat: number; fix_count: number; moved_m: number }>;
  activities: Array<{
    route_geometry: [number, number][];
    route_source: string;
    gps_points: number;
    recorded_geometry: [number, number][] | null;
    predicted_geometry?: [number, number][];
    prediction_gap?: { within100Pct: number } | null;
    accuracy: { score: string; fixes: number };
  }>;
  connectors: Array<{ from_time: string; to_time: string; is_routed: boolean }>;
};

beforeEach(() => {
  // Routing is down: journeys fall back to straight lines, no network needed.
  vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
});
afterEach(() => vi.unstubAllGlobals());

describe("getDay journey lines and gaps", () => {
  const home = visit(1, "08:00", "09:00", 40.7128, -74.006);
  const work = visit(2, "09:30", "11:00", 40.758, -73.9855);

  it("joins a journey to adjacent nearby stops without extra gap lines", async () => {
    const drive = journey(10, "09:00", "09:30", [40.7135, -74.0065], [40.7575, -73.986]);
    const day = (await getDay(dayDb([home, work], [drive]), "t1", DATE)) as DayResult;
    expect(day.activities[0].route_geometry[0]).toEqual([40.7128, -74.006]);
    expect(day.activities[0].route_geometry.at(-1)).toEqual([40.758, -73.9855]);
    expect(day.activities[0].route_source).toBe("straight");
    expect(day.activities[0].gps_points).toBe(0);
    expect(day.connectors).toEqual([]);
  });

  it("keeps a far jump after a journey visible as unknown movement", async () => {
    const shortDrive = journey(10, "09:00", "09:10", [40.7135, -74.0065], [40.74, -73.99]);
    const day = (await getDay(dayDb([home, work], [shortDrive]), "t1", DATE)) as DayResult;
    expect(day.activities[0].route_geometry.at(-1)).toEqual([40.74, -73.99]);
    expect(day.connectors).toHaveLength(1);
    expect(day.connectors[0].from_time).toBe(`${DATE}T09:10:00.000Z`);
    expect(day.connectors[0].is_routed).toBe(true);
  });

  it("starts a GPS journey at the previous stop when its recorded start is wrong", async () => {
    // Recorded start ~25 km away, but the first fix is next to home.
    const drive = {
      ...journey(10, "09:00", "09:30", [40.9, -74.2], [40.7575, -73.986]),
      mode: "train",
      path: [[40.714, -74.005, Date.parse(`${DATE}T09:05:00Z`) / 1000]] as [number, number, number][],
    };
    const day = (await getDay(dayDb([home, work], [drive]), "t1", DATE)) as DayResult;
    expect(day.activities[0].route_source).toBe("gps");
    expect(day.activities[0].route_geometry[0]).toEqual([40.7128, -74.006]);
    expect(day.activities[0].route_geometry).not.toContainEqual([40.9, -74.2]);
    expect(day.connectors).toEqual([]);
  });

  it("skips gaps between overlapping stays", async () => {
    const nested = visit(3, "10:00", "10:30", 40.7595, -73.9845);
    const later = visit(4, "12:00", "13:00", 40.7484, -73.9857);
    const day = (await getDay(dayDb([work, nested, later], []), "t1", DATE)) as DayResult;
    expect(day.connectors.map((c) => [c.from_time, c.to_time])).toEqual([
      [`${DATE}T10:30:00.000Z`, `${DATE}T12:00:00.000Z`],
    ]);
  });

  it("draws stays at their GPS position and reports how far Google's place was", async () => {
    const homeFixed = { ...home, fixLat: 40.7138, fixLon: -74.006, fixCount: 4 };
    const day = (await getDay(dayDb([homeFixed, work], []), "t1", DATE)) as DayResult;
    expect(day.visits[0]).toMatchObject({ lat: 40.7138, place_lat: 40.7128, fix_count: 4 });
    expect(day.visits[0].moved_m).toBeGreaterThan(100);
  });

  it("returns recorded and, with compare, predicted lines plus accuracy", async () => {
    const t = Date.parse(`${DATE}T09:10:00Z`) / 1000;
    const train = {
      ...journey(10, "09:00", "09:30", [40.7135, -74.0065], [40.7575, -73.986]),
      mode: "train",
      path: [[40.73, -73.996, t], [40.74, -73.992, t + 300]] as [number, number, number][],
    };
    const plain = (await getDay(dayDb([home, work], [train]), "t1", DATE)) as DayResult;
    expect(plain.activities[0].recorded_geometry).toContainEqual([40.73, -73.996]);
    expect(plain.activities[0].predicted_geometry).toBeUndefined();
    expect(plain.activities[0].accuracy.fixes).toBe(2);

    const compared = (await getDay(dayDb([home, work], [train]), "t1", DATE, undefined, undefined, {
      compare: true,
    })) as DayResult;
    expect(compared.activities[0].predicted_geometry!.length).toBeGreaterThan(2);
    expect(compared.activities[0].prediction_gap).not.toBeNull();
  });
});
