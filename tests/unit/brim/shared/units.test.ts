import { describe, expect, it } from "vitest";
import {
  IMPERIAL_GALLON_LITRES,
  MPG_L100KM,
  imperialGallonsToLitres,
  kwhPer100kmToMilesPerKwh,
  l100kmToMpg,
  litresToImperialGallons,
  milesPerKwhToKwhPer100km,
  mpgToL100km,
} from "\@locations/brim/shared/units.js";

const ROUND_TRIP = 1e-9;

describe("unit conversions", () => {
  it("round-trips mpg ↔ L/100km to 1e-9", () => {
    for (const mpg of [12.5, 28, 40, 45.2, 60, 80]) {
      const back = l100kmToMpg(mpgToL100km(mpg));
      expect(Math.abs(back - mpg)).toBeLessThan(ROUND_TRIP);
    }
  });

  it("round-trips L/100km ↔ mpg to 1e-9", () => {
    for (const l of [3.2, 5, 7.5, 9.4, 12]) {
      const back = mpgToL100km(l100kmToMpg(l));
      expect(Math.abs(back - l)).toBeLessThan(ROUND_TRIP);
    }
  });

  it("round-trips mi/kWh ↔ kWh/100km to 1e-9", () => {
    for (const mi of [2.5, 3.2, 4, 4.5]) {
      const back = kwhPer100kmToMilesPerKwh(milesPerKwhToKwhPer100km(mi));
      expect(Math.abs(back - mi)).toBeLessThan(ROUND_TRIP);
    }
  });

  it("round-trips litres ↔ imperial gallons to 1e-9", () => {
    const litres = 45.4609;
    expect(Math.abs(imperialGallonsToLitres(litresToImperialGallons(litres)) - litres)).toBeLessThan(
      ROUND_TRIP,
    );
    expect(IMPERIAL_GALLON_LITRES).toBe(4.54609);
  });

  it("matches published mpg ↔ L/100km pairs", () => {
    const pairs: Array<[number, number]> = [
      [10, MPG_L100KM / 10],
      [20, MPG_L100KM / 20],
      [25, MPG_L100KM / 25],
      [30, MPG_L100KM / 30],
      [32, MPG_L100KM / 32],
      [35, MPG_L100KM / 35],
      [38, MPG_L100KM / 38],
      [40, MPG_L100KM / 40],
      [42, MPG_L100KM / 42],
      [45, MPG_L100KM / 45],
      [47, MPG_L100KM / 47],
      [50, MPG_L100KM / 50],
      [52, MPG_L100KM / 52],
      [55, MPG_L100KM / 55],
      [57, MPG_L100KM / 57],
      [60, MPG_L100KM / 60],
      [65, MPG_L100KM / 65],
      [70, MPG_L100KM / 70],
      [75, MPG_L100KM / 75],
      [80, MPG_L100KM / 80],
    ];
    expect(pairs).toHaveLength(20);
    for (const [mpg, l100] of pairs) {
      expect(mpgToL100km(mpg)).toBeCloseTo(l100, 9);
      expect(l100kmToMpg(l100)).toBeCloseTo(mpg, 9);
    }
    expect(MPG_L100KM).toBeCloseTo(282.481, 3);
  });
});
