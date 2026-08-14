import { describe, expect, it } from "vitest";
import { classifyLocation, haversineKm, mapTransportMode } from "@locations/db";

describe("classifyLocation", () => {
  it("uses a 0.5 degree grid, not a UK gazetteer", () => {
    expect(classifyLocation(51.5, -0.1)).toMatch(/N/);
    expect(classifyLocation(-33.9, 18.4)).toMatch(/S/);
    expect(classifyLocation(40.7, -74)).not.toMatch(/London/i);
  });
});

describe("haversineKm", () => {
  it("measures NYC to Philly roughly 130km", () => {
    const km = haversineKm(40.7128, -74.006, 39.9526, -75.1652);
    expect(km).toBeGreaterThan(120);
    expect(km).toBeLessThan(150);
  });
});

describe("mapTransportMode", () => {
  it("maps google types", () => {
    expect(mapTransportMode("IN_PASSENGER_VEHICLE")).toBe("car");
    expect(mapTransportMode("walking")).toBe("walking");
  });
});
