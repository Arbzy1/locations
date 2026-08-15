import { afterEach, describe, expect, it, vi } from "vitest";
import { placeCache, routeCache } from "@locations/db";
import {
  configureGeoEndpoints,
  fetchRoute,
  resolveCoords,
} from "@locations/api/services";

function geoDb(opts: { routeRows?: unknown[]; placeRows?: unknown[] } = {}) {
  return {
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: async () => {
            if (table === routeCache) return opts.routeRows ?? [];
            if (table === placeCache) return opts.placeRows ?? [];
            return [];
          },
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: async () => undefined,
      }),
    }),
  };
}

describe("geo HTTP helpers", () => {
  afterEach(() => {
    configureGeoEndpoints({});
    vi.unstubAllGlobals();
  });

  it("honors OSRM_BASE and GEOCODE_BASE", async () => {
    configureGeoEndpoints({
      OSRM_BASE: "https://osrm.example/route/v1",
      GEOCODE_BASE: "https://geo.example/reverse",
    });
    const fetchMock = vi.fn(async () => new Response("nope", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const db = geoDb();
    await fetchRoute(db as never, 40.7, -74.0, 40.8, -73.9, "car");
    await resolveCoords(db as never, 40.7, -74.0);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("https://osrm.example/route/v1/driving/");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("https://geo.example/reverse?");
  });

  it("skips the network for flying, train, and subway", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const db = geoDb();
    const flying = await fetchRoute(db as never, 1, 2, 3, 4, "flying");
    const train = await fetchRoute(db as never, 1, 2, 3, 4, "train");
    expect(flying.geometry).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(train.steps).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns cached routes without fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const geometry: [number, number][] = [
      [40.7, -74],
      [40.8, -73.9],
    ];
    const db = geoDb({ routeRows: [{ geometry, steps: [{ name: "cached" }] }] });
    const result = await fetchRoute(db as never, 40.7, -74, 40.8, -73.9, "car");
    expect(result.geometry).toEqual(geometry);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to a straight line when OSRM is down", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 503 })));
    const result = await fetchRoute(geoDb() as never, 40.7, -74, 40.8, -73.9, "walking");
    expect(result.geometry).toEqual([
      [40.7, -74],
      [40.8, -73.9],
    ]);
    expect(result.steps).toEqual([]);
  });

  it("falls back when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network");
    }));
    const result = await fetchRoute(geoDb() as never, 1, 2, 3, 4, "car");
    expect(result.geometry).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it("returns cached places without fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const db = geoDb({
      placeRows: [{ name: "Cafe", address: "1 Main", data: { cached: true } }],
    });
    const result = await resolveCoords(db as never, 40.7, -74);
    expect(result).toEqual({ name: "Cafe", address: "1 Main", data: { cached: true } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns Unknown when Nominatim fails and sends a User-Agent", async () => {
    const fetchMock = vi.fn(async () => new Response("nope", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await resolveCoords(geoDb() as never, 40.7, -74);
    expect(result).toEqual({ name: "Unknown", address: "", data: {} });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)["User-Agent"]).toMatch(/LocationExplorer/);
  });

  it("returns Unknown when geocode fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("timeout");
    }));
    const result = await resolveCoords(geoDb() as never, 40.7, -74);
    expect(result.name).toBe("Unknown");
  });
});
