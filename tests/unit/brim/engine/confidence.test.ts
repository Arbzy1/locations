import { describe, expect, it } from "vitest";
import { applyBand, bandWidth, extraFallbacksFromCalibration } from "\@locations/brim/engine/confidence.js";

describe("bandWidth", () => {
  it("uses the spec half-widths for tiers 0 to 4", () => {
    expect(bandWidth(0, 0)).toBe(0.04);
    expect(bandWidth(1, 0)).toBe(0.08);
    expect(bandWidth(2, 0)).toBe(0.1);
    expect(bandWidth(3, 0)).toBe(0.2);
    expect(bandWidth(4, 0)).toBe(0.25);
  });

  it("adds 3% per fallback and never narrows", () => {
    expect(bandWidth(2, 1)).toBe(0.13);
    expect(bandWidth(2, 2)).toBe(0.16);
    expect(bandWidth(0, 1)).toBeGreaterThan(bandWidth(0, 0));
  });
});

describe("applyBand", () => {
  it("spreads low and high by the half-width", () => {
    const band = applyBand(100, 0.1);
    expect(band.point).toBe(100);
    expect(band.low).toBeCloseTo(90, 10);
    expect(band.high).toBeCloseTo(110, 10);
  });
});

describe("extraFallbacksFromCalibration", () => {
  it("treats CV above 0.15 as one extra fallback", () => {
    expect(extraFallbacksFromCalibration({ value: 6.2, stddev: 0.2 })).toBe(0);
    expect(extraFallbacksFromCalibration({ value: 6.2, stddev: 0.94 })).toBe(1);
    expect(extraFallbacksFromCalibration(undefined)).toBe(0);
  });
});
