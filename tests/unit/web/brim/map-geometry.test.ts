import { encodePolyline } from "@locations/brim/shared";
import { describe, expect, it } from "vitest";
import {
  boundsFromPoints,
  formatCoordLabel,
  isInUkBox,
  polylinePoints,
  ukBounds,
} from "@locations/web/lib/brim/map-geometry";

describe("map-geometry", () => {
  it("formats a compact coordinate label", () => {
    expect(formatCoordLabel(51.5074, -0.1278)).toBe("51.5074, -0.1278");
  });

  it("builds bounds from decoded points inside the UK box", () => {
    const encoded = encodePolyline([
      { lat: 51.1092, lng: -0.1872 },
      { lat: 51.5074, lng: -0.1278 },
    ]);
    const points = polylinePoints(encoded);
    expect(points.length).toBeGreaterThanOrEqual(2);
    expect(points.every(isInUkBox)).toBe(true);
    const bounds = boundsFromPoints(points);
    expect(bounds).not.toBeNull();
    expect(ukBounds()[0]?.[0]).toBe(-8.2);
  });
});
