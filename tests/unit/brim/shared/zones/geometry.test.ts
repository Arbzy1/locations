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
    for (const scheme of CHARGE_CATALOGUE) {
      const ring = scheme.geometry.coordinates[0]?.[0];
      expect(ring, scheme.id).toBeDefined();
      const lngs = ring!.map((p) => p[0]!);
      const lats = ring!.map((p) => p[1]!);
      const west = Math.min(...lngs);
      const east = Math.max(...lngs);
      const south = Math.min(...lats);
      const north = Math.max(...lats);
      const midLng = (west + east) / 2;
      const midLat = (south + north) / 2;
      expect(pointInPolygon(midLng, midLat, scheme.geometry), `${scheme.id} inside`).toBe(true);
      expect(pointInPolygon(midLng, south - 2, scheme.geometry), `${scheme.id} outside`).toBe(false);
      const span = Math.max(0.002, (east - west) * 0.25);
      const near = [
        { lat: south - 0.003, lng: midLng - span },
        { lat: south - 0.003, lng: midLng + span },
      ];
      expect(lineIntersectsPolygon(near, scheme.geometry), `${scheme.id} near intersects`).toBe(false);
      expect(lineNearPolygon(near, scheme.geometry), `${scheme.id} near miss`).toBe(true);
    }
  });
});
