import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActivityRow, PathPoint } from "@locations/db";
import {
  configureGeoEndpoints,
  connectorMode,
  fetchTraceRoute,
  joinLegSteps,
  journeyAnchor,
  plausibleRouteLength,
  routeActivity,
} from "@locations/api/services";

type CacheRow = { key: string; geometry: unknown; steps: unknown };

function traceDb(routeRows: unknown[] = []) {
  const inserted: CacheRow[] = [];
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => routeRows }),
      }),
    }),
    insert: () => ({
      values: (row: CacheRow) => {
        inserted.push(row);
        return { onConflictDoUpdate: async () => undefined };
      },
    }),
  };
  return { db: db as never, inserted };
}

const t0 = Date.parse("2024-06-01T09:00:00Z") / 1000;
// ~5.3 km through Manhattan (synthetic).
const trace: PathPoint[] = [
  [40.7128, -74.006, t0],
  [40.73, -73.995, t0 + 600],
  [40.758, -73.9855, t0 + 1800],
];
const line = [
  [-74.006, 40.7128],
  [-73.995, 40.73],
  [-73.9855, 40.758],
];
const step = {
  name: "Broadway",
  distance: 5000,
  duration: 900,
  maneuver: { type: "depart" },
  geometry: { coordinates: line },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const matchOk = (distance: number, matchedPoints = 3) =>
  json({
    code: "Ok",
    matchings: [{ distance, geometry: { coordinates: line }, legs: [{ steps: [step] }] }],
    tracepoints: Array.from({ length: matchedPoints }, () => ({})),
  });
const routeOk = (distance: number) =>
  json({ code: "Ok", routes: [{ distance, geometry: { coordinates: line }, legs: [{ steps: [step] }] }] });

function activity(overrides: Partial<ActivityRow> = {}): ActivityRow {
  return {
    id: 1,
    tenant: "t1",
    sourceId: "s1",
    start: "2024-06-01T09:00:00.000Z",
    end: "2024-06-01T09:30:00.000Z",
    date: "2024-06-01",
    startLat: 40.7128,
    startLon: -74.006,
    endLat: 40.758,
    endLon: -73.9855,
    mode: "car",
    distanceMeters: 5600,
    durationMinutes: 30,
    path: [[40.73, -73.995, t0 + 600]],
    ...overrides,
  };
}

afterEach(() => {
  configureGeoEndpoints({});
  vi.unstubAllGlobals();
});

describe("fetchTraceRoute", () => {
  it("map-matches the recorded fixes and caches the result", async () => {
    const fetchMock = vi.fn(async () => matchOk(6000));
    vi.stubGlobal("fetch", fetchMock);
    const { db, inserted } = traceDb();
    const result = await fetchTraceRoute(db, trace, "car");
    expect(result?.geometry).toEqual(line.map(([lon, lat]) => [lat, lon]));
    expect(result?.steps[0].name).toBe("Broadway");
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain("/match/v1/driving/");
    expect(url).toContain("radiuses=30;30;30");
    expect(url).toContain(`timestamps=${t0};${t0 + 600};${t0 + 1800}`);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].key).toMatch(/^trace:driving:3:/);
  });

  it("derives the match endpoint from a custom OSRM_BASE", async () => {
    configureGeoEndpoints({ OSRM_BASE: "https://osrm.example/route/v1" });
    const fetchMock = vi.fn(async () => matchOk(6000));
    vi.stubGlobal("fetch", fetchMock);
    await fetchTraceRoute(traceDb().db, trace, "car");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("https://osrm.example/match/v1/driving/");
  });

  it("falls back to routing through the fixes when matching fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ code: "NoMatch" }, 400))
      .mockResolvedValueOnce(routeOk(5800));
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchTraceRoute(traceDb().db, trace, "car");
    expect(result?.steps).toHaveLength(1);
    const url = String(fetchMock.mock.calls[1]?.[0]);
    expect(url).toContain("/route/v1/driving/-74.006,40.7128;-73.995,40.73;-73.9855,40.758?");
  });

  it("rejects detours and remembers that no road route fits", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(matchOk(40_000)).mockResolvedValueOnce(routeOk(40_000)),
    );
    const { db, inserted } = traceDb();
    expect(await fetchTraceRoute(db, trace, "walking")).toBeNull();
    expect(inserted[0].geometry).toEqual([]);
  });

  it("does not cache when OSRM is rate limited", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("slow down", { status: 429 })));
    const { db, inserted } = traceDb();
    expect(await fetchTraceRoute(db, trace, "car")).toBeNull();
    expect(inserted).toHaveLength(0);
  });

  it("serves cached failures without fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { db } = traceDb([{ geometry: [], steps: [] }]);
    expect(await fetchTraceRoute(db, trace, "car")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("matches long traces in overlapping chunks of 10 fixes", async () => {
    const long: PathPoint[] = Array.from({ length: 12 }, (_, i) => [40.7 + i * 0.005, -74, t0 + i * 60]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(matchOk(5000, 10))
      .mockResolvedValueOnce(matchOk(1200, 3));
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchTraceRoute(traceDb().db, long, "car");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = String(fetchMock.mock.calls[0]?.[0]);
    const second = String(fetchMock.mock.calls[1]?.[0]);
    expect(first.split("/driving/")[1].split("?")[0].split(";")).toHaveLength(10);
    expect(second).toContain(`/match/v1/driving/-74,${long[9][0]};`);
    expect(result?.steps).toHaveLength(2);
  });

  it("rejects a chunk where most fixes could not be matched", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(matchOk(6000, 1))
      .mockResolvedValueOnce(routeOk(5800));
    vi.stubGlobal("fetch", fetchMock);
    await fetchTraceRoute(traceDb().db, trace, "car");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/route/v1/");
  });

  it("sends strictly increasing timestamps when fixes share a minute", async () => {
    const fetchMock = vi.fn(async () => matchOk(6000));
    vi.stubGlobal("fetch", fetchMock);
    await fetchTraceRoute(traceDb().db, [trace[0], [40.73, -73.995, t0], trace[2]], "car");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(`timestamps=${t0};${t0 + 1};${t0 + 1800}`);
  });
});

describe("routeActivity", () => {
  it("uses the GPS road route when the journey has fixes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => matchOk(6000)));
    const result = await routeActivity(traceDb().db, activity());
    expect(result.source).toBe("gps-road");
    expect(result.gpsPoints).toBe(1);
  });

  it("draws raw fixes for trains without calling OSRM", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await routeActivity(traceDb().db, activity({ mode: "train" }));
    expect(result.source).toBe("gps");
    expect(result.geometry).toEqual([
      [40.7128, -74.006],
      [40.73, -73.995],
      [40.758, -73.9855],
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to raw fixes when no road route fits", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ code: "NoMatch" }, 400)));
    const result = await routeActivity(traceDb().db, activity({ mode: "walking" }));
    expect(result.source).toBe("gps");
  });

  it("estimates from endpoints when there are no fixes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => routeOk(5800)));
    const result = await routeActivity(traceDb().db, activity({ path: null }));
    expect(result.source).toBe("road-estimate");
    expect(result.gpsPoints).toBe(0);
  });

  it("marks rail without fixes for the drawn arc", async () => {
    const result = await routeActivity(traceDb().db, activity({ mode: "subway", path: null }));
    expect(result.source).toBe("rail-arc");
  });
});

describe("journeyAnchor", () => {
  const stop: [number, number] = [40.7128, -74.006];
  const fixNearStop: PathPoint = [40.714, -74.005, t0];

  it("keeps the recorded endpoint when it agrees with the stop", () => {
    expect(journeyAnchor([40.713, -74.0062], stop, fixNearStop)).toEqual([40.713, -74.0062]);
  });

  it("trusts the stop when GPS says the recorded endpoint is wrong", () => {
    expect(journeyAnchor([40.9, -74.2], stop, fixNearStop)).toEqual(stop);
  });

  it("keeps a far recorded endpoint that GPS agrees with", () => {
    expect(journeyAnchor([40.9, -74.2], stop, [40.899, -74.199, t0])).toEqual([40.9, -74.2]);
  });

  it("needs both a stop and a fix to override", () => {
    expect(journeyAnchor([40.9, -74.2], null, fixNearStop)).toEqual([40.9, -74.2]);
    expect(journeyAnchor([40.9, -74.2], stop, undefined)).toEqual([40.9, -74.2]);
  });
});

describe("joinLegSteps", () => {
  const s = (direction: string, name: string, distance_meters = 100) => ({
    direction,
    name,
    distance_meters,
    duration_seconds: 10,
    geometry: [] as [number, number][],
  });

  it("drops arrive/depart pairs at leg joins and blanks maneuver-type names", () => {
    const joined = joinLegSteps([
      s("Depart", "High Street"),
      s("Arrive", "High Street", 0),
      s("Depart", "depart"),
      s("Turn left", "Mill Lane"),
      s("Arrive", "arrive", 0),
    ]);
    expect(joined.map((x) => [x.direction, x.name])).toEqual([
      ["Depart", "High Street"],
      ["Continue", ""],
      ["Turn left", "Mill Lane"],
      ["Arrive", ""],
    ]);
  });
});

describe("plausibleRouteLength", () => {
  it("accepts routes near the recorded distance only", () => {
    expect(plausibleRouteLength(6000, 5300)).toBe(true);
    expect(plausibleRouteLength(1200, 300)).toBe(true);
    expect(plausibleRouteLength(20_000, 5300)).toBe(false);
    expect(plausibleRouteLength(1000, 5300)).toBe(false);
    expect(plausibleRouteLength(0, 5300)).toBe(false);
  });
});

describe("connectorMode", () => {
  it("guesses walking for slow short gaps and driving otherwise", () => {
    expect(connectorMode(1000, "2024-06-01T09:00:00Z", "2024-06-01T09:15:00Z")).toBe("walking");
    expect(connectorMode(1000, "2024-06-01T09:00:00Z", "2024-06-01T09:01:00Z")).toBe("car");
    expect(connectorMode(20_000, "2024-06-01T09:00:00Z", "2024-06-01T19:00:00Z")).toBe("car");
    expect(connectorMode(400, "2024-06-01T09:00:00Z", "2024-06-01T09:00:00Z")).toBe("car");
  });
});
