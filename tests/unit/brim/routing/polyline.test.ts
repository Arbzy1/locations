import { describe, expect, it } from "vitest";
import { decodePolyline, encodePolyline } from "\@locations/brim/routing/polyline.js";

describe("polyline re-export", () => {
  it("round-trips through @locations/brim/shared", () => {
    const points = [
      { lat: 51.5, lng: -0.12 },
      { lat: 52.5, lng: -1.9 },
    ];
    const decoded = decodePolyline(encodePolyline(points));
    expect(decoded).toHaveLength(2);
    expect(decoded[0]?.lat).toBeCloseTo(51.5, 5);
  });
});
