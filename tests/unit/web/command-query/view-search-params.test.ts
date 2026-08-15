import { describe, expect, it } from "vitest";
import {
  gpsHotspotsPath,
  hasSavableFilters,
  parseCoverageRange,
  parseDayTripsQuery,
  parseHotspotsQuery,
  serializeDayTripsQuery,
  serializeHotspotsQuery,
} from "@locations/web/lib/nav/view-search-params";

describe("hotspots query params", () => {
  it("round-trips filters and maps duration to dwell", () => {
    const sp = new URLSearchParams(
      "from=2024-01-01&to=2024-12-31&sources=a,b&types=Home&tags=fav&fav=1&rank=duration&lat=51.5&lon=-0.1",
    );
    const q = parseHotspotsQuery(sp);
    expect(q.rank).toBe("dwell");
    expect(q.sources).toEqual(["a", "b"]);
    expect(q.fav).toBe(true);
    expect(q.lat).toBe(51.5);
    const out = serializeHotspotsQuery(q);
    expect(out.get("rank")).toBe("duration");
    expect(out.get("from")).toBe("2024-01-01");
    expect(out.get("fav")).toBe("1");
  });

  it("omits defaults", () => {
    const out = serializeHotspotsQuery({
      from: "",
      to: "",
      sources: [],
      types: [],
      tags: [],
      fav: false,
      rank: "visits",
      lat: null,
      lon: null,
    });
    expect(out.toString()).toBe("");
  });
});

describe("day trips query params", () => {
  it("round-trips year, modes, min, and place q", () => {
    const q = parseDayTripsQuery(new URLSearchParams("year=2024&mode=car,train&min=12&q=park"));
    expect(q).toEqual({ year: "2024", modes: ["car", "train"], min: 12, q: "park" });
    expect(serializeDayTripsQuery(q).get("mode")).toBe("car,train");
  });
});

describe("coverage and gps helpers", () => {
  it("reads from/to", () => {
    expect(parseCoverageRange(new URLSearchParams("from=2024-01-01"))).toEqual({
      from: "2024-01-01",
      to: undefined,
    });
  });

  it("keeps existing hotspots search when jumping to GPS", () => {
    expect(gpsHotspotsPath(1, 2, "from=2024-01-01")).toContain("from=2024-01-01");
    expect(gpsHotspotsPath(1, 2, "from=2024-01-01")).toContain("lat=1");
  });

  it("detects savable filters", () => {
    expect(hasSavableFilters("/hotspots", "")).toBe(false);
    expect(hasSavableFilters("/hotspots", "?from=2024-01-01")).toBe(true);
    expect(hasSavableFilters("/trips", "?year=2024")).toBe(true);
    expect(hasSavableFilters("/insights", "?from=2024-01-01")).toBe(false);
  });
});
