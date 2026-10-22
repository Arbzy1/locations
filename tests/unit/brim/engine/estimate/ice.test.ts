import { DIESEL_KG_CO2E_PER_LITRE, PETROL_KG_CO2E_PER_LITRE } from "@locations/brim/shared";
import { describe, expect, it } from "vitest";
import { estimateIce } from "\@locations/brim/engine/estimate/ice.js";

describe("estimateIce", () => {
  it("uses litres = km/100 × l/100km and cost = litres × ppl", () => {
    const ice = estimateIce({
      distanceMeters: 100_000,
      lPer100km: 6,
      pricePencePerLitre: 140,
      propulsion: "petrol",
      halfWidth: 0,
    });
    expect(ice.litres.point).toBe(6);
    expect(ice.costPence.point).toBe(840);
    expect(ice.co2Kg).toBeCloseTo(6 * PETROL_KG_CO2E_PER_LITRE, 10);
  });

  it("uses the diesel DEFRA factor for diesel CO₂", () => {
    const petrol = estimateIce({
      distanceMeters: 100_000,
      lPer100km: 6,
      pricePencePerLitre: 140,
      propulsion: "petrol",
      halfWidth: 0,
    });
    const diesel = estimateIce({
      distanceMeters: 100_000,
      lPer100km: 6,
      pricePencePerLitre: 140,
      propulsion: "diesel",
      halfWidth: 0,
    });
    expect(diesel.co2Kg).toBeCloseTo(6 * DIESEL_KG_CO2E_PER_LITRE, 10);
    expect(diesel.co2Kg).toBeGreaterThan(petrol.co2Kg);
  });

  it("spreads litres and cost by the half-width", () => {
    const ice = estimateIce({
      distanceMeters: 100_000,
      lPer100km: 10,
      pricePencePerLitre: 100,
      propulsion: "petrol",
      halfWidth: 0.1,
    });
    expect(ice.litres).toEqual({ point: 10, low: 9, high: 11 });
    expect(ice.costPence).toEqual({ point: 1000, low: 900, high: 1100 });
  });
});
