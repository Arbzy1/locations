import {
  CLASS_AVERAGE_L_PER_100KM,
  milesPerKwhToKwhPer100km,
  mpgToL100km,
  ROAD_SHAPE,
} from "@locations/brim/shared";
import { describe, expect, it } from "vitest";
import { bandWidth, extraFallbacksFromCalibration } from "\@locations/brim/engine/confidence.js";
import { applyRoadShape } from "\@locations/brim/engine/consumption/roadShape.js";
import { resolveConsumption } from "\@locations/brim/engine/consumption/resolve.js";

describe("resolveConsumption tier chain", () => {
  it("selects tier 0 when calibration has ≥3 samples", () => {
    const r = resolveConsumption({
      kind: "liquid",
      calibration: { value: 6.5, unit: "l/100km", sampleCount: 3 },
      userEntered: { value: 40, unit: "mpg" },
      official: { value: 5, unit: "l/100km", cycle: "WLTP" },
    });
    expect(r.tier).toBe(0);
    expect(r.reasons.some((s) => s.includes("last 3 brim-to-brim intervals"))).toBe(true);
    expect(r.label).toBe("Based on your fill-ups");
    expect(r.value).toBe(6.5);
  });

  it("rejects calibration with fewer than 3 samples and falls through", () => {
    const r = resolveConsumption({
      kind: "liquid",
      calibration: { value: 6.5, unit: "l/100km", sampleCount: 2 },
      userEntered: { value: 7, unit: "l/100km" },
    });
    expect(r.tier).toBe(1);
    expect(r.reasons.some((s) => s.includes("at least 3 brim-to-brim intervals"))).toBe(true);
  });

  it("selects tier 1 for user-entered", () => {
    const r = resolveConsumption({
      kind: "liquid",
      userEntered: { value: 40, unit: "mpg" },
      official: { value: 5, unit: "l/100km", cycle: "WLTP" },
    });
    expect(r.tier).toBe(1);
    expect(r.label).toBe("You told us");
    expect(r.value).toBeCloseTo(mpgToL100km(40), 9);
  });

  it("converts typed mi/kWh on the electric path", () => {
    const r = resolveConsumption({
      kind: "electric",
      userEntered: { value: 4, unit: "mi/kWh" },
    });
    expect(r.tier).toBe(1);
    expect(r.unit).toBe("kWh/100km");
    expect(r.value).toBeCloseTo(milesPerKwhToKwhPer100km(4), 9);
  });

  it("uses the hybrid class average, not petrol", () => {
    const hybrid = resolveConsumption({ kind: "liquid", propulsion: "hybrid" });
    const petrol = resolveConsumption({ kind: "liquid", propulsion: "petrol" });
    expect(hybrid.value).toBe(CLASS_AVERAGE_L_PER_100KM.hybrid);
    expect(petrol.value).toBe(CLASS_AVERAGE_L_PER_100KM.petrol);
    expect(hybrid.value).not.toBe(petrol.value);
  });

  it("selects tier 2 for official WLTP with 1.12 correction", () => {
    const r = resolveConsumption({
      kind: "liquid",
      official: { value: 5, unit: "l/100km", cycle: "WLTP" },
    });
    expect(r.tier).toBe(2);
    expect(r.value).toBeCloseTo(5.6, 6);
    expect(r.label).toBe("Official figure, adjusted");
  });

  it("selects tier 2 for official NEDC with 1.25 correction", () => {
    const r = resolveConsumption({
      kind: "liquid",
      official: { value: 8, unit: "l/100km", cycle: "NEDC" },
    });
    expect(r.value).toBeCloseTo(10, 6);
  });

  it("selects tier 2 for EV official with 1.15 correction", () => {
    const r = resolveConsumption({
      kind: "electric",
      official: { value: 16, unit: "kWh/100km", cycle: "WLTP" },
    });
    expect(r.value).toBeCloseTo(18.4, 6);
  });

  it("selects tier 3 for class average", () => {
    const r = resolveConsumption({
      kind: "liquid",
      classAverage: { value: 7.5, unit: "l/100km" },
    });
    expect(r.tier).toBe(3);
  });

  it("selects tier 4 for provider estimate", () => {
    const r = resolveConsumption({
      kind: "liquid",
      providerEstimate: { litres: 8, distanceKm: 100 },
    });
    expect(r.tier).toBe(4);
    expect(r.value).toBeCloseTo(8, 6);
  });

  it("falls back to class average when nothing else is provided", () => {
    const r = resolveConsumption({ kind: "liquid", propulsion: "petrol" });
    expect(r.tier).toBe(3);
    expect(r.value).toBeGreaterThan(0);
  });
});

describe("road shape and bands", () => {
  it("inverts urban and motorway between ICE and EV", () => {
    const resolved = resolveConsumption({
      kind: "liquid",
      userEntered: { value: 10, unit: "l/100km" },
    });
    const urbanIce = applyRoadShape(resolved, "liquid", { urban: 1, rural: 0, motorway: 0 });
    const urbanEv = applyRoadShape(resolved, "electric", { urban: 1, rural: 0, motorway: 0 });
    const motorIce = applyRoadShape(resolved, "liquid", { urban: 0, rural: 0, motorway: 1 });
    const motorEv = applyRoadShape(resolved, "electric", { urban: 0, rural: 0, motorway: 1 });
    expect(urbanIce.value).toBeCloseTo(10 * ROAD_SHAPE.ice.urban, 10);
    expect(urbanEv.value).toBeCloseTo(10 * ROAD_SHAPE.ev.urban, 10);
    expect(motorIce.value).toBeCloseTo(10 * ROAD_SHAPE.ice.motorway, 10);
    expect(motorEv.value).toBeCloseTo(10 * ROAD_SHAPE.ev.motorway, 10);
    expect(urbanIce.fallbacks).toBe(0);
    expect(urbanIce.value).toBeGreaterThan(motorIce.value);
    expect(urbanEv.value).toBeLessThan(motorEv.value);
  });

  it("downgrades when composition is missing", () => {
    const resolved = resolveConsumption({
      kind: "liquid",
      userEntered: { value: 8, unit: "l/100km" },
    });
    const shaped = applyRoadShape(resolved, "liquid", undefined);
    expect(shaped.fallbacks).toBe(1);
    expect(shaped.value).toBe(resolved.value);
  });

  it("never narrows the band when a fallback is added", () => {
    const w0 = bandWidth(2, 0);
    const w1 = bandWidth(2, 1);
    expect(w1).toBeGreaterThan(w0);
  });

  it("adds a fallback when calibration scatter is high", () => {
    expect(extraFallbacksFromCalibration({ value: 6.2, stddev: 0.2 })).toBe(0);
    expect(extraFallbacksFromCalibration({ value: 6.2, stddev: 2 })).toBe(1);
    expect(extraFallbacksFromCalibration({ value: 6.2 })).toBe(0);
  });
});
