import { describe, expect, it } from "vitest";
import { findPlaceByLabel } from "\@locations/brim/shared/places.js";
import { CHARGE_CATALOGUE, schemeById } from "\@locations/brim/shared/zones/catalogue.js";
import { detectHitsFromLine } from "\@locations/brim/shared/zones/detect.js";
import { lineIntersectsPolygon, lineNearPolygon, pointInPolygon } from "\@locations/brim/shared/zones/geometry.js";

function line(origin: string, dest: string) {
  const a = findPlaceByLabel(origin)!;
  const b = findPlaceByLabel(dest)!;
  return [
    { lat: a.lat, lng: a.lng },
    { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 },
    { lat: b.lat, lng: b.lng },
  ];
}

describe("zone geometry", () => {
  it("places London inside ULEZ and CC, Crawley outside both", () => {
    const ulez = schemeById("london-ulez")!;
    const cc = schemeById("london-cc")!;
    const london = findPlaceByLabel("London")!;
    const crawley = findPlaceByLabel("Crawley")!;
    expect(pointInPolygon(london.lng, london.lat, ulez.geometry)).toBe(true);
    expect(pointInPolygon(london.lng, london.lat, cc.geometry)).toBe(true);
    expect(pointInPolygon(crawley.lng, crawley.lat, ulez.geometry)).toBe(false);
    expect(pointInPolygon(crawley.lng, crawley.lat, cc.geometry)).toBe(false);
  });

  it("intersects Crawley to London with ULEZ and CC", () => {
    const hits = detectHitsFromLine(line("Crawley", "London"), CHARGE_CATALOGUE);
    expect(hits.some((h) => h.scheme.id === "london-ulez" && h.relation === "intersects")).toBe(true);
    expect(hits.some((h) => h.scheme.id === "london-cc" && h.relation === "intersects")).toBe(true);
  });

  it("treats a parallel line south of ULEZ as a near miss", () => {
    const ulez = schemeById("london-ulez")!;
    const points = [
      { lat: 51.282, lng: -0.3 },
      { lat: 51.282, lng: -0.1 },
    ];
    expect(lineIntersectsPolygon(points, ulez.geometry)).toBe(false);
    expect(lineNearPolygon(points, ulez.geometry)).toBe(true);
  });

  it("has an inside, outside, and near-miss sample for every scheme", () => {
    expect(CHARGE_CATALOGUE.length).toBe(23);
    for (const scheme of CHARGE_CATALOGUE) {
      const ring = scheme.geometry.coordinates[0]?.[0];
      expect(ring, scheme.id).toBeDefined();
      const lngs = ring!.map((p) => p[0]!);
      const lats = ring!.map((p) => p[1]!);
      const west = Math.min(...lngs);
      const east = Math.max(...lngs);
      const south = Math.min(...lats);
      const north = Math.max(...lats);

      let insideFound = pointInPolygon((west + east) / 2, (south + north) / 2, scheme.geometry);
      if (!insideFound) {
        for (let r = 1; r < 20 && !insideFound; r++) {
          for (let c = 1; c < 20 && !insideFound; c++) {
            const lng = west + ((east - west) * c) / 20;
            const lat = south + ((north - south) * r) / 20;
            if (pointInPolygon(lng, lat, scheme.geometry)) insideFound = true;
          }
        }
      }
      expect(insideFound, `${scheme.id} inside`).toBe(true);
      expect(pointInPolygon((west + east) / 2, south - 2, scheme.geometry), `${scheme.id} outside`).toBe(false);

      const southVertex = ring!.reduce((best, cur) => (cur[1]! < best[1]! ? cur : best), ring![0]!);
      const southLng = southVertex[0]!;
      const span = Math.max(0.002, (east - west) * 0.15);
      const near = [
        { lat: south - 0.003, lng: southLng - span },
        { lat: south - 0.003, lng: southLng + span },
      ];
      expect(lineIntersectsPolygon(near, scheme.geometry), `${scheme.id} near intersects`).toBe(false);
      expect(lineNearPolygon(near, scheme.geometry), `${scheme.id} near miss`).toBe(true);
    }
  });

  it("keeps M6 Toll strictly on the toll corridor and London ULEZ strictly inside the M25", () => {
    const m6Toll = schemeById("m6-toll")!;
    expect(pointInPolygon(-1.825, 52.61, m6Toll.geometry)).toBe(true);
    expect(pointInPolygon(-1.98, 52.58, m6Toll.geometry)).toBe(false);
    expect(pointInPolygon(-1.69, 52.63, m6Toll.geometry)).toBe(false);
    expect(pointInPolygon(-1.89, 52.48, m6Toll.geometry)).toBe(false);

    const ulez = schemeById("london-ulez")!;
    expect(pointInPolygon(-0.18, 51.695, ulez.geometry)).toBe(false);
    expect(pointInPolygon(0.26, 51.55, ulez.geometry)).toBe(false);
    expect(pointInPolygon(-0.15, 51.265, ulez.geometry)).toBe(false);
    expect(pointInPolygon(-0.50, 51.47, ulez.geometry)).toBe(false);
  });
});
