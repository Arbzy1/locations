import { describe, expect, it } from "vitest";
import { computeEstimate } from "\@locations/brim/engine/index.js";
import { estimateIce } from "\@locations/brim/engine/estimate/ice.js";

const PRICE = 140;
const DISTANCE = 100_000;

describe("ICE fixtures", () => {
  const vehicles: Array<{ name: string; l100: number; litres: number }> = [
    { name: "fiesta", l100: 5.6, litres: 5.6 },
    { name: "golf", l100: 6.2, litres: 6.2 },
    { name: "focus", l100: 6.8, litres: 6.8 },
    { name: "octavia", l100: 5.1, litres: 5.1 },
    { name: "qashqai", l100: 7.4, litres: 7.4 },
    { name: "passat", l100: 6.0, litres: 6.0 },
    { name: "corsa", l100: 5.4, litres: 5.4 },
    { name: "a4", l100: 6.5, litres: 6.5 },
    { name: "civic", l100: 5.8, litres: 5.8 },
    { name: "yaris", l100: 4.9, litres: 4.9 },
  ];

  it("matches hand-verified litres and cost at 100 km / 140 ppl", () => {
    for (const v of vehicles) {
      const ice = estimateIce({
        distanceMeters: DISTANCE,
        lPer100km: v.l100,
        pricePencePerLitre: PRICE,
        propulsion: "petrol",
        halfWidth: 0,
      });
      expect(ice.litres.point).toBeCloseTo(v.litres, 2);
      expect(ice.costPence.point).toBeCloseTo(v.litres * PRICE, 2);
    }
  });
});

describe("computeEstimate", () => {
  it("returns a valid estimate from only distance and propulsion", () => {
    const e = computeEstimate({
      distanceMeters: DISTANCE,
      propulsion: "petrol",
      pricePence: PRICE,
      priceUnit: "ppl",
      priceSource: "hardcoded-fallback",
      priceObservedAt: "2026-01-01T00:00:00Z",
    });
    expect(e.consumption.tier === 3 || e.consumption.tier === 4).toBe(true);
    expect(e.cost.totalPence.point).toBeGreaterThan(0);
    expect(e.reasons.length).toBeGreaterThan(0);
  });

  it("splits a PHEV into electric then petrol", () => {
    const batteryOnly = computeEstimate({
      distanceMeters: 10_000,
      propulsion: "phev",
      vehicle: { kind: "car", propulsion: "phev", batteryKwhUsable: 15, startChargePercent: 100 },
      official: { value: 18, unit: "kWh/100km", cycle: "WLTP" },
      pricePence: 7,
      priceUnit: "p/kWh",
      priceSource: "user-tariff",
      priceObservedAt: "2026-01-01T00:00:00Z",
    });
    expect(batteryOnly.energy.kwh?.battery).toBeGreaterThan(0);

    const exhausted = computeEstimate({
      distanceMeters: 400_000,
      propulsion: "phev",
      vehicle: { kind: "car", propulsion: "phev", batteryKwhUsable: 10, startChargePercent: 50 },
      official: { value: 20, unit: "kWh/100km", cycle: "WLTP" },
      pricePence: 7,
      priceUnit: "p/kWh",
      priceSource: "user-tariff",
      priceObservedAt: "2026-01-01T00:00:00Z",
    });
    expect(exhausted.energy.litres?.point).toBeGreaterThan(0);

    const livePetrol = computeEstimate({
      distanceMeters: 400_000,
      propulsion: "phev",
      vehicle: { kind: "car", propulsion: "phev", batteryKwhUsable: 10, startChargePercent: 50 },
      official: { value: 20, unit: "kWh/100km", cycle: "WLTP" },
      pricePence: 7,
      priceUnit: "p/kWh",
      priceSource: "user-tariff",
      priceObservedAt: "2026-01-01T00:00:00Z",
      liquidPricePence: 132.2,
    });
    const silent140 = computeEstimate({
      distanceMeters: 400_000,
      propulsion: "phev",
      vehicle: { kind: "car", propulsion: "phev", batteryKwhUsable: 10, startChargePercent: 50 },
      official: { value: 20, unit: "kWh/100km", cycle: "WLTP" },
      pricePence: 7,
      priceUnit: "p/kWh",
      priceSource: "user-tariff",
      priceObservedAt: "2026-01-01T00:00:00Z",
    });
    expect(livePetrol.cost.energyPence.point).toBeLessThan(silent140.cost.energyPence.point);

    const noCharge = computeEstimate({
      distanceMeters: 50_000,
      propulsion: "phev",
      vehicle: { kind: "car", propulsion: "phev", batteryKwhUsable: 12 },
      pricePence: 140,
      priceUnit: "ppl",
      priceSource: "national-median",
      priceObservedAt: "2026-01-01T00:00:00Z",
    });
    expect(noCharge.warnings.some((w) => w.code === "phev-no-start-charge")).toBe(true);
  });

  it("uses liquid calibration on the PHEV petrol tail", () => {
    const vehicle = { kind: "car" as const, propulsion: "phev" as const, batteryKwhUsable: 10, startChargePercent: 50 };
    const base = {
      distanceMeters: 400_000,
      propulsion: "phev" as const,
      vehicle,
      official: { value: 20, unit: "kWh/100km" as const, cycle: "WLTP" as const },
      pricePence: 7,
      priceUnit: "p/kWh" as const,
      priceSource: "user-tariff" as const,
      priceObservedAt: "2026-01-01T00:00:00Z",
      liquidPricePence: 140,
    };
    const brochure = computeEstimate(base);
    const calibrated = computeEstimate({
      ...base,
      calibration: { value: 3.2, unit: "l/100km", sampleCount: 4 },
    });
    expect(calibrated.consumption.tier).toBe(0);
    expect(calibrated.energy.litres?.point).toBeLessThan(brochure.energy.litres?.point ?? 0);
  });

  it("widens the band when fill-up scatter is high, without leaving tier 0", () => {
    const stable = computeEstimate({
      distanceMeters: DISTANCE,
      propulsion: "petrol",
      calibration: { value: 6.2, unit: "l/100km", sampleCount: 4, stddev: 0.2 },
      pricePence: PRICE,
      priceUnit: "ppl",
      priceSource: "national-median",
      priceObservedAt: "2026-01-01T00:00:00Z",
    });
    const noisy = computeEstimate({
      distanceMeters: DISTANCE,
      propulsion: "petrol",
      calibration: { value: 6.2, unit: "l/100km", sampleCount: 4, stddev: 2 },
      pricePence: PRICE,
      priceUnit: "ppl",
      priceSource: "national-median",
      priceObservedAt: "2026-01-01T00:00:00Z",
    });
    expect(noisy.consumption.tier).toBe(0);
    expect(noisy.cost.totalPence.high - noisy.cost.totalPence.low).toBeGreaterThan(
      stable.cost.totalPence.high - stable.cost.totalPence.low,
    );
    expect(noisy.reasons.some((s) => s.includes("fill-ups vary"))).toBe(true);
  });
});
