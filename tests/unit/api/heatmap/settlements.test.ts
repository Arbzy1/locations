import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enrichHeatmapSettlements, hotspotTitle, placeKind, type HeatmapPoint } from "@locations/api/services";

/**
 * Fake place_cache: batched `inArray` reads return every cached row (enrichment indexes them
 * by placeId), single-row lookups (`.limit`) miss so no live path is taken by accident.
 */
function cacheDb(rows: { placeId: string; name: string; address?: string; data?: unknown }[]) {
  const full = rows.map((r) => ({ address: "", data: {}, ...r }));
  const chain = () => {
    const q: Record<string, unknown> = {};
    q.where = () => q;
    q.limit = async () => [];
    q.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => Promise.resolve(full).then(resolve, reject);
    return q;
  };
  return {
    select: () => ({ from: () => chain() }),
    insert: () => ({ values: () => ({ onConflictDoNothing: async () => {}, onConflictDoUpdate: async () => {} }) }),
  } as never;
}

const coordKey = (lat: number, lon: number) => `coord:${lat.toFixed(5)},${lon.toFixed(5)}`;
const townKey = (lat: number, lon: number) => `settlement:${lat.toFixed(5)},${lon.toFixed(5)}`;

function point(lat: number, lon: number, extra: Partial<HeatmapPoint> = {}): HeatmapPoint {
  return {
    lat,
    lon,
    count: 8,
    label: "",
    cluster: "51.5°N 0.5°W",
    placeKey: null,
    name: null,
    kind: null,
    street: null,
    totalDurationMinutes: 10,
    uniqueDays: 2,
    topTypes: [],
    settlement: null,
    ...extra,
  } as HeatmapPoint;
}

describe("hotspot titles", () => {
  it("prefer your name, then Home/Work, the street, the town, a nearby name, coordinates", () => {
    const base = { lat: 51.3456, lon: -0.2551, name: null, kind: null, street: null, settlement: null };
    expect(hotspotTitle({ ...base, name: "Gran's", kind: "home", street: "Silvergate" })).toBe("Gran's");
    expect(hotspotTitle({ ...base, kind: "home", street: "Silvergate" })).toBe("Home");
    expect(hotspotTitle({ ...base, street: "Partridge Road", settlement: "Epsom" })).toBe("Partridge Road");
    expect(hotspotTitle({ ...base, settlement: "Epsom" })).toBe("Near Epsom");
    expect(hotspotTitle({ ...base, near: "Partridge Road" })).toBe("Near Partridge Road");
    expect(hotspotTitle(base)).toBe("Near 51.3456, -0.2551");
  });

  it("read home and work from Google's place types", () => {
    expect(placeKind(["Inferred Home"])).toBe("home");
    expect(placeKind(["Inferred Work", "Home"])).toBe("work");
    expect(placeKind(["Aliased Location"])).toBeNull();
    expect(placeKind([])).toBeNull();
  });
});

describe("enrichHeatmapSettlements", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("names hotspots by street and town from the cache, without live calls", async () => {
    const p = point(51.33, -0.26);
    await enrichHeatmapSettlements(
      cacheDb([
        { placeId: coordKey(51.33, -0.26), name: "Partridge Road" },
        { placeId: townKey(51.33, -0.26), name: "Epsom" },
      ]),
      [p],
    );
    expect(p.street).toBe("Partridge Road");
    expect(p.settlement).toBe("Epsom");
    expect(p.label).toBe("Partridge Road");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps Home as the title with the street alongside", async () => {
    const p = point(51.34, -0.25, { kind: "home", topTypes: ["Home"] });
    await enrichHeatmapSettlements(cacheDb([{ placeId: coordKey(51.34, -0.25), name: "Silvergate" }]), [p]);
    expect(p.label).toBe("Home");
    expect(p.street).toBe("Silvergate");
  });

  it("calls an unnamed hotspot near the closest named one", async () => {
    const named = point(51.33, -0.26);
    const unnamed = point(51.334, -0.26); // ~450 m north, nothing cached
    await enrichHeatmapSettlements(cacheDb([{ placeId: coordKey(51.33, -0.26), name: "Partridge Road" }]), [named, unnamed]);
    expect(unnamed.label).toBe("Near Partridge Road");
  });

  it("does not treat cached misses as names", async () => {
    const p = point(51.5, -0.1);
    await enrichHeatmapSettlements(
      cacheDb([
        { placeId: coordKey(51.5, -0.1), name: "Unknown" },
        { placeId: townKey(51.5, -0.1), name: "(none)" },
      ]),
      [p],
    );
    expect(p.street).toBeNull();
    expect(p.label).toBe("Near 51.5000, -0.1000");
  });
});
