import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CHARGING_EFFICIENCY,
  CLASS_AVERAGE_KWH_PER_100KM,
  CLASS_AVERAGE_L_PER_100KM,
  DIESEL_KG_CO2E_PER_LITRE,
  NEDC_CORRECTION,
  PETROL_KG_CO2E_PER_LITRE,
  WLTP_CORRECTION,
  WLTP_EV_CORRECTION,
} from "@locations/brim/shared";
import { describe, expect, it } from "vitest";
import { bandWidth } from "\@locations/brim/engine/confidence.js";
import { computeEstimate, type EstimateInput } from "\@locations/brim/engine/index.js";
import { roundBandPence } from "\@locations/brim/engine/rounding.js";

const dir = join(dirname(fileURLToPath(import.meta.url)), "../../../fixtures/brim/golden");

const scenarios: Array<{ name: string; input: EstimateInput }> = [
  {
    name: "petrol-calibrated",
    input: {
      distanceMeters: 160934,
      durationSeconds: 7200,
      propulsion: "petrol",
      calibration: { value: 6.2, unit: "l/100km", sampleCount: 4 },
      pricePence: 139.9,
      priceUnit: "ppl",
      priceSource: "national-median",
      priceObservedAt: "2026-01-15T12:00:00Z",
    },
  },
  {
    name: "petrol-official",
    input: {
      distanceMeters: 160934,
      propulsion: "petrol",
      official: { value: 5.5, unit: "l/100km", cycle: "WLTP" },
      pricePence: 139.9,
      priceUnit: "ppl",
      priceSource: "national-median",
      priceObservedAt: "2026-01-15T12:00:00Z",
    },
  },
  {
    name: "petrol-unknown",
    input: {
      distanceMeters: 160934,
      propulsion: "petrol",
      pricePence: 139.9,
      priceUnit: "ppl",
      priceSource: "hardcoded-fallback",
      priceObservedAt: "2026-01-15T12:00:00Z",
    },
  },
  {
    name: "diesel-calibrated",
    input: {
      distanceMeters: 200000,
      propulsion: "diesel",
      calibration: { value: 5.1, unit: "l/100km", sampleCount: 6 },
      pricePence: 145,
      priceUnit: "ppl",
      priceSource: "home-area-median",
      priceObservedAt: "2026-01-15T12:00:00Z",
    },
  },
  {
    name: "diesel-official",
    input: {
      distanceMeters: 200000,
      propulsion: "diesel",
      official: { value: 4.8, unit: "l/100km", cycle: "NEDC" },
      pricePence: 145,
      priceUnit: "ppl",
      priceSource: "national-median",
      priceObservedAt: "2026-01-15T12:00:00Z",
    },
  },
  {
    name: "diesel-unknown",
    input: {
      distanceMeters: 200000,
      propulsion: "diesel",
      pricePence: 145,
      priceUnit: "ppl",
      priceSource: "hardcoded-fallback",
      priceObservedAt: "2026-01-15T12:00:00Z",
    },
  },
  {
    name: "bev-calibrated",
    input: {
      distanceMeters: 160934,
      propulsion: "bev",
      calibration: { value: 16, unit: "kWh/100km", sampleCount: 5 },
      vehicle: { kind: "car", propulsion: "bev", batteryKwhUsable: 64, startChargePercent: 90 },
      pricePence: 7.5,
      priceUnit: "p/kWh",
      priceSource: "user-tariff",
      priceObservedAt: "2026-01-15T12:00:00Z",
      forecastTempC: 12,
      gridIntensityGPerKwh: 120,
    },
  },
  {
    name: "bev-official",
    input: {
      distanceMeters: 160934,
      propulsion: "bev",
      official: { value: 15, unit: "kWh/100km", cycle: "WLTP" },
      vehicle: { kind: "car", propulsion: "bev", batteryKwhUsable: 50, startChargePercent: 80, hasHeatPump: true },
      pricePence: 7.5,
      priceUnit: "p/kWh",
      priceSource: "user-tariff",
      priceObservedAt: "2026-01-15T12:00:00Z",
      forecastTempC: 2,
      gridIntensityGPerKwh: 120,
    },
  },
  {
    name: "bev-unknown",
    input: {
      distanceMeters: 160934,
      propulsion: "bev",
      pricePence: 28,
      priceUnit: "p/kWh",
      priceSource: "hardcoded-fallback",
      priceObservedAt: "2026-01-15T12:00:00Z",
    },
  },
  {
    name: "phev-calibrated",
    input: {
      distanceMeters: 80000,
      propulsion: "phev",
      calibration: { value: 3.2, unit: "l/100km", sampleCount: 4 },
      vehicle: { kind: "car", propulsion: "phev", batteryKwhUsable: 14, startChargePercent: 100 },
      pricePence: 7.5,
      priceUnit: "p/kWh",
      priceSource: "user-tariff",
      priceObservedAt: "2026-01-15T12:00:00Z",
    },
  },
  {
    name: "phev-official",
    input: {
      distanceMeters: 80000,
      propulsion: "phev",
      official: { value: 18, unit: "kWh/100km", cycle: "WLTP" },
      vehicle: { kind: "car", propulsion: "phev", batteryKwhUsable: 14, startChargePercent: 40 },
      pricePence: 7.5,
      priceUnit: "p/kWh",
      priceSource: "user-tariff",
      priceObservedAt: "2026-01-15T12:00:00Z",
    },
  },
  {
    name: "phev-unknown",
    input: {
      distanceMeters: 80000,
      propulsion: "phev",
      pricePence: 140,
      priceUnit: "ppl",
      priceSource: "hardcoded-fallback",
      priceObservedAt: "2026-01-15T12:00:00Z",
    },
  },
];

describe("golden estimates", () => {
  it("has 12 scenarios", () => {
    expect(scenarios).toHaveLength(12);
  });

  for (const s of scenarios) {
    it(s.name, () => {
      const actual = computeEstimate(s.input);
      const path = join(dir, `${s.name}.json`);
      mkdirSync(dir, { recursive: true });
      let expected: unknown;
      try {
        expected = JSON.parse(readFileSync(path, "utf8")) as unknown;
      } catch {
        writeFileSync(path, `${JSON.stringify(actual, null, 2)}\n`);
        expected = actual;
      }
      expect(JSON.parse(JSON.stringify(actual))).toEqual(expected);
    });
  }
});

function iceHandWorked(input: {
  distanceMeters: number;
  l100: number;
  pricePence: number;
  tier: 0 | 1 | 2 | 3 | 4;
  diesel?: boolean;
}) {
  const km = input.distanceMeters / 1000;
  const litres = (km / 100) * input.l100;
  const half = bandWidth(input.tier, 1);
  const cost = roundBandPence({
    point: litres * input.pricePence,
    low: litres * (1 - half) * input.pricePence,
    high: litres * (1 + half) * input.pricePence,
  });
  const factor = input.diesel ? DIESEL_KG_CO2E_PER_LITRE : PETROL_KG_CO2E_PER_LITRE;
  return { litres, cost, co2Kg: litres * factor };
}

describe("golden hand-worked values", () => {
  it("petrol-calibrated is 6.2 l/100km at tier 0", () => {
    const actual = computeEstimate(scenarios[0]!.input);
    const expected = iceHandWorked({
      distanceMeters: 160934,
      l100: 6.2,
      pricePence: 139.9,
      tier: 0,
    });
    expect(actual.consumption.tier).toBe(0);
    expect(actual.consumption.label).toBe("Based on your fill-ups");
    expect(actual.energy.litres?.point).toBeCloseTo(expected.litres, 10);
    expect(actual.cost.totalPence).toEqual(expected.cost);
    expect(actual.co2Kg).toBeCloseTo(expected.co2Kg, 10);
  });

  it("petrol-official applies WLTP × 1.12", () => {
    const actual = computeEstimate(scenarios[1]!.input);
    expect(actual.consumption.tier).toBe(2);
    expect(actual.consumption.value).toBeCloseTo(5.5 * WLTP_CORRECTION, 10);
    const expected = iceHandWorked({
      distanceMeters: 160934,
      l100: 5.5 * WLTP_CORRECTION,
      pricePence: 139.9,
      tier: 2,
    });
    expect(actual.cost.totalPence).toEqual(expected.cost);
  });

  it("petrol-unknown uses the petrol class average", () => {
    const actual = computeEstimate(scenarios[2]!.input);
    expect(actual.consumption.tier).toBe(3);
    expect(actual.consumption.value).toBe(CLASS_AVERAGE_L_PER_100KM.petrol);
  });

  it("diesel-calibrated uses the diesel CO₂ factor", () => {
    const actual = computeEstimate(scenarios[3]!.input);
    const expected = iceHandWorked({
      distanceMeters: 200000,
      l100: 5.1,
      pricePence: 145,
      tier: 0,
      diesel: true,
    });
    expect(actual.co2Kg).toBeCloseTo(expected.co2Kg, 10);
    expect(actual.cost.totalPence).toEqual(expected.cost);
  });

  it("diesel-official applies NEDC × 1.25", () => {
    const actual = computeEstimate(scenarios[4]!.input);
    expect(actual.consumption.value).toBeCloseTo(4.8 * NEDC_CORRECTION, 10);
  });

  it("bev-official bills grid kWh after WLTP EV correction, cold, and heat pump", () => {
    const actual = computeEstimate(scenarios[7]!.input);
    const kwhPer100 = 15 * WLTP_EV_CORRECTION;
    const km = 160.934;
    const heatPumpFactor = 1 + (1.25 - 1) / 2;
    const battery = (km / 100) * kwhPer100 * heatPumpFactor;
    const grid = battery / CHARGING_EFFICIENCY.acHome;
    expect(actual.consumption.tier).toBe(2);
    expect(actual.consumption.value).toBeCloseTo(kwhPer100, 10);
    expect(actual.energy.kwh?.battery).toBeCloseTo(battery, 10);
    expect(actual.energy.kwh?.grid).toBeCloseTo(grid, 10);
    expect(actual.energy.arrivalStateOfCharge?.verdict).toBe("tight");
  });

  it("bev-unknown uses the BEV class average", () => {
    const actual = computeEstimate(scenarios[8]!.input);
    expect(actual.consumption.tier).toBe(3);
    expect(actual.consumption.value).toBe(CLASS_AVERAGE_KWH_PER_100KM.bev);
  });

  it("phev-unknown without a start charge stays on the combined liquid figure", () => {
    const actual = computeEstimate(scenarios[11]!.input);
    expect(actual.warnings.some((w) => w.code === "phev-no-start-charge")).toBe(true);
    expect(actual.consumption.tier).toBe(3);
    expect(actual.consumption.value).toBe(CLASS_AVERAGE_L_PER_100KM.hybrid);
  });
});
