import { describe, expect, it } from "vitest";
import { observationsNearPolyline, perpendicularMetersToPolyline } from "\@locations/brim/shared/geo/polyline-distance.js";

const line = [
  { lat: 51.1092, lng: -0.1872 },
  { lat: 51.3083, lng: -0.1575 },
  { lat: 51.5074, lng: -0.1278 },
];

describe("polyline distance", () => {
  it("is near zero for a point on the line", () => {
    expect(perpendicularMetersToPolyline({ lat: 51.3083, lng: -0.1575 }, line)).toBeLessThan(5);
  });

  it("keeps corridor stations and drops far ones", () => {
    const hits = observationsNearPolyline(
      [
        {
          stationId: "on",
          grade: "E10",
          priceTenthsPence: 1250,
          observedAt: "2026-08-16T12:00:00Z",
          lat: 51.3083,
          lng: -0.1575,
          isStale: false,
        },
        {
          stationId: "far",
          grade: "E10",
          priceTenthsPence: 1200,
          observedAt: "2026-08-16T12:00:00Z",
          lat: 52.0,
          lng: -2.0,
          isStale: false,
        },
        {
          stationId: "stale",
          grade: "E10",
          priceTenthsPence: 1100,
          observedAt: "2026-07-01T12:00:00Z",
          lat: 51.3083,
          lng: -0.1575,
          isStale: true,
        },
      ],
      line,
      1500,
      "E10",
    );
    expect(hits.map((h) => h.stationId)).toEqual(["on"]);
  });
});
