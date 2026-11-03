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
    const base = { lat: 52.1234, lon: -1.2345, name: null, kind: null, street: null, settlement: null };
    expect(hotspotTitle({ ...base, name: "Gran's house", kind: "home", street: "Orchard Close" })).toBe("Gran's house");
    expect(hotspotTitle({ ...base, kind: "home", street: "Orchard Close" })).toBe("Home");
    expect(hotspotTitle({ ...base, street: "Mill Lane", settlement: "Townsville" })).toBe("Mill Lane");
    expect(hotspotTitle({ ...base, settlement: "Townsville" })).toBe("Near Townsville");
    expect(hotspotTitle({ ...base, near: "Mill Lane" })).toBe("Near Mill Lane");
    expect(hotspotTitle(base)).toBe("Near 52.1234, -1.2345");
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
    const p = point(52.0, -1.0);
    await enrichHeatmapSettlements(
      cacheDb([
        { placeId: coordKey(52.0, -1.0), name: "Mill Lane" },
        { placeId: townKey(52.0, -1.0), name: "Townsville" },
      ]),
      [p],
    );
    expect(p.street).toBe("Mill Lane");
    expect(p.settlement).toBe("Townsville");
    expect(p.label).toBe("Mill Lane");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps Home as the title with the street alongside", async () => {
    const p = point(52.01, -1.01, { kind: "home", topTypes: ["Home"] });
    await enrichHeatmapSettlements(cacheDb([{ placeId: coordKey(52.01, -1.01), name: "Orchard Close" }]), [p]);
    expect(p.label).toBe("Home");
    expect(p.street).toBe("Orchard Close");
  });

  it("calls an unnamed hotspot near the closest named one", async () => {
    const named = point(52.0, -1.0);
    const unnamed = point(52.004, -1.0); // ~450 m north, nothing cached
    await enrichHeatmapSettlements(cacheDb([{ placeId: coordKey(52.0, -1.0), name: "Mill Lane" }]), [named, unnamed]);
    expect(unnamed.label).toBe("Near Mill Lane");
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
