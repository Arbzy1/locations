import { describe, expect, it } from "vitest";
import { haversineMeters, pathLengthMeters } from "@locations/web/lib/map/mapMeasure";
import { spiderfyOffsets } from "@locations/web/lib/map/mapSpiderfy";
import { mapillaryUrl, streetViewUrl } from "@locations/web/lib/map/mapLinks";
import { expandRasterTiles } from "@locations/web/lib/map/mapStyle";

describe("map measure", () => {
  it("returns ~0 for identical points and sums a path", () => {
    const a = { lat: 51.5, lon: -0.1 };
    expect(haversineMeters(a, a)).toBe(0);
    const path = [
      { lat: 0, lon: 0 },
      { lat: 0, lon: 1 },
      { lat: 0, lon: 2 },
    ];
    expect(pathLengthMeters(path)).toBeGreaterThan(200_000);
  });
});

describe("spiderfy", () => {
  it("returns one offset per leaf", () => {
    expect(spiderfyOffsets(0)).toEqual([]);
    expect(spiderfyOffsets(5)).toHaveLength(5);
  });
});

describe("lookaround links", () => {
  it("uses lat/lon only", () => {
    expect(streetViewUrl(51.5, -0.12)).toContain("viewpoint=51.5,-0.12");
    expect(mapillaryUrl(51.5, -0.12)).toContain("lat=51.5");
    expect(mapillaryUrl(51.5, -0.12)).toContain("lng=-0.12");
  });
});

describe("raster tiles", () => {
  it("expands {s} subdomains", () => {
    const tiles = expandRasterTiles("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png");
    expect(tiles).toHaveLength(4);
    expect(tiles[0]).toContain("a.basemaps");
    expect(tiles[0]).not.toContain("{r}");
  });
});
