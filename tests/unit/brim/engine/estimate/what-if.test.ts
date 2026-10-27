import { IMPERIAL_GALLON_LITRES, MILE_KM, mpgToL100km } from "@locations/brim/shared";
import { describe, expect, it } from "vitest";
import { playFuelFromText, seedFuelPlay, type PlayFuelSuccess } from "@locations/brim/engine/estimate/what-if.js";

const HUNDRED_MILES_M = 100 * MILE_KM * 1000;

function base(overrides: Partial<Parameters<typeof playFuelFromText>[0]> = {}) {
  return {
    routeMeters: HUNDRED_MILES_M,
    milesText: null,
    mpgText: "40",
    priceText: "145",
    speedText: "60",
    referenceMph: 60,
    chargesPence: 0,
    propulsion: "petrol" as const,
    saveText: "",
    ...overrides,
  };
}

function ok(result: ReturnType<typeof playFuelFromText>): PlayFuelSuccess {
  if (!result.ok) throw new Error("expected a fuel figure");
  return result;
}

describe("seedFuelPlay", () => {
  it("seeds mpg from litres per 100 km, speed from the route, and a pump price", () => {
    const seed = seedFuelPlay({
      distanceMeters: HUNDRED_MILES_M,
      durationSeconds: 2 * 3600,
      consumptionValue: mpgToL100km(40),
      consumptionUnit: "l/100km",
      pricePence: 145.5,
      priceUnit: "ppl",
    });
    expect(seed.mpg).toBe("40");
    expect(seed.speed).toBe("50");
    expect(seed.referenceMph).toBe(50);
    expect(seed.price).toBe("145.5");
    expect(seed.miles).toBeCloseTo(100, 6);
  });

  it("reads a rounded mpg label and ignores an electric price", () => {
    const seed = seedFuelPlay({
      distanceMeters: HUNDRED_MILES_M,
      durationSeconds: 0,
      consumptionDisplay: "37 mpg",
      consumptionUnit: "kWh/100km",
      consumptionValue: 16,
      pricePence: 7.5,
      priceUnit: "p/kWh",
      fallbackPricePence: 140,
    });
    expect(seed.mpg).toBe("37");
    expect(seed.price).toBe("140");
    expect(seed.speed).toBe("60");
  });

  it("clamps a very fast route average into the steady-speed range", () => {
    const seed = seedFuelPlay({
      distanceMeters: HUNDRED_MILES_M,
      durationSeconds: 20 * 60,
      consumptionDisplay: "40 mpg",
    });
    expect(seed.speed).toBe("80");
    expect(seed.referenceMph).toBe(80);
  });
});

describe("playFuelFromText", () => {
  it("costs 100 miles at 40 mpg and 145 p per litre", () => {
    const result = ok(playFuelFromText(base()));
    const litres = (100 / 40) * IMPERIAL_GALLON_LITRES;
    expect(result.miles).toBeCloseTo(100, 6);
    expect(result.effectiveMpg).toBeCloseTo(40, 6);
    expect(result.litres).toBeCloseTo(litres, 6);
    expect(result.fuelPence).toBeCloseTo(litres * 145, 6);
    expect(result.totalPence).toBeCloseTo(litres * 145, 6);
    expect(result.hours).toBeCloseTo(100 / 60, 6);
    expect(result.versusReference.litresDelta).toBeCloseTo(0, 6);
    expect(result.save).toBeNull();
  });

  it("adds tolls and clean-air charges on top of fuel", () => {
    const result = ok(playFuelFromText(base({ chargesPence: 1500 })));
    expect(result.chargesPence).toBe(1500);
    expect(result.totalPence).toBeCloseTo(result.fuelPence + 1500, 6);
  });

  it("changes the fuel cost with price and leaves the litres alone", () => {
    const low = ok(playFuelFromText(base({ priceText: "120" })));
    const high = ok(playFuelFromText(base({ priceText: "180" })));
    expect(high.litres).toBeCloseTo(low.litres, 6);
    expect(high.fuelPence).toBeCloseTo(low.fuelPence * 1.5, 6);
  });

  it("uses less fuel at a higher mpg", () => {
    const low = ok(playFuelFromText(base({ mpgText: "30" })));
    const high = ok(playFuelFromText(base({ mpgText: "60" })));
    expect(high.litres).toBeCloseTo(low.litres / 2, 6);
    expect(high.fuelPence).toBeCloseTo(low.fuelPence / 2, 6);
  });

  it("uses more fuel at a higher steady speed and less when slower", () => {
    const pace = ok(playFuelFromText(base()));
    const faster = ok(playFuelFromText(base({ speedText: "70" })));
    const slower = ok(playFuelFromText(base({ speedText: "40" })));
    expect(faster.litres).toBeGreaterThan(pace.litres);
    expect(slower.litres).toBeLessThan(pace.litres);
    expect(faster.versusReference.litresDelta).toBeGreaterThan(0);
    expect(slower.versusReference.penceDelta).toBeLessThan(0);
  });

  it("uses the diesel factor for CO2", () => {
    const petrol = ok(playFuelFromText(base()));
    const diesel = ok(playFuelFromText(base({ propulsion: "diesel" })));
    expect(diesel.litres).toBeCloseTo(petrol.litres, 6);
    expect(diesel.co2Kg).toBeGreaterThan(petrol.co2Kg);
  });

  it("accepts a typed mileage instead of the route", () => {
    const result = ok(playFuelFromText(base({ routeMeters: null, milesText: "50" })));
    expect(result.miles).toBe(50);
    expect(result.litres).toBeCloseTo(ok(playFuelFromText(base())).litres / 2, 6);
  });

  it("accepts a comma as a decimal point", () => {
    const result = ok(playFuelFromText(base({ mpgText: "40,5", priceText: "145,5" })));
    expect(result.effectiveMpg).toBeCloseTo(40.5, 6);
    expect(result.fuelPence).toBeCloseTo(result.litres * 145.5, 6);
  });

  it("waits while a number is half typed", () => {
    expect(playFuelFromText(base({ mpgText: "40." })).ok).toBe(false);
    expect(playFuelFromText(base({ mpgText: "40." }))).toEqual({ ok: false, pending: true });
  });

  it("reports every bad field at once", () => {
    const result = playFuelFromText(
      base({
        milesText: "0",
        mpgText: "0",
        priceText: "-2",
        speedText: "10",
        saveText: "nope",
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok || result.pending) throw new Error("expected field errors");
    const fields = result.issues.map((issue) => issue.field);
    expect(fields).toEqual(["miles", "mpg", "price", "speed", "save"]);
    expect(result.issues.map((issue) => issue.message)).toEqual([
      "Miles must be above 0.",
      "Enter an mpg above 0.",
      "Enter a pump price above 0.",
      "Keep steady speed between 20 and 80 mph.",
      "Enter litres to save as a number, or leave it blank.",
    ]);
  });

  it("rejects empty, nonsense, and out of range figures", () => {
    expect(playFuelFromText(base({ mpgText: "" }))).toMatchObject({
      ok: false,
      issues: [{ field: "mpg", message: "Enter an mpg above 0." }],
    });
    expect(playFuelFromText(base({ mpgText: "fast" }))).toMatchObject({
      issues: [{ field: "mpg", message: "Enter mpg as a number, using a dot for decimals." }],
    });
    expect(playFuelFromText(base({ mpgText: "301" }))).toMatchObject({
      issues: [{ field: "mpg", message: "That mpg is above 300. Check the figure." }],
    });
    expect(playFuelFromText(base({ priceText: "" }))).toMatchObject({
      issues: [{ field: "price", message: "Enter a pump price above 0." }],
    });
    expect(playFuelFromText(base({ priceText: "1001" }))).toMatchObject({
      issues: [{ field: "price", message: "That price is above 1000 p per litre. Check it." }],
    });
    expect(playFuelFromText(base({ speedText: "90" }))).toMatchObject({
      issues: [{ field: "speed", message: "Keep steady speed between 20 and 80 mph." }],
    });
    expect(playFuelFromText(base({ speedText: "" }))).toMatchObject({
      issues: [{ field: "speed", message: "Enter a speed in mph." }],
    });
    expect(playFuelFromText(base({ routeMeters: 0, milesText: null }))).toMatchObject({
      issues: [{ field: "miles", message: "The route has no distance yet. Type the miles instead." }],
    });
    expect(playFuelFromText(base({ milesText: "" }))).toMatchObject({
      issues: [{ field: "miles", message: "Enter the miles for this drive." }],
    });
    expect(playFuelFromText(base({ milesText: "2001" }))).toMatchObject({
      issues: [{ field: "miles", message: "Keep a single drive under 2000 miles." }],
    });
    expect(playFuelFromText(base({ referenceMph: 0 }))).toMatchObject({
      issues: [{ field: "speed", message: "Set a speed first." }],
    });
  });

  it("finds the steady speed and mpg that save a litre", () => {
    const start = ok(playFuelFromText(base()));
    const planned = ok(playFuelFromText(base({ saveText: "1" })));
    expect(planned.save?.ok).toBe(true);
    if (!planned.save?.ok) return;
    expect(planned.save.savedLitres).toBe(1);
    expect(planned.save.savedPence).toBeCloseTo(145, 6);
    expect(planned.save.speedMph).toBeLessThan(60);
    expect(planned.save.mpgNeeded).toBeGreaterThan(start.effectiveMpg);

    const atSpeed = ok(
      playFuelFromText(
        base({
          speedText: String(planned.save.speedMph),
          referenceMph: 60,
          saveText: "",
        }),
      ),
    );
    expect(atSpeed.litres).toBeCloseTo(start.litres - 1, 5);

    const atMpg = ok(
      playFuelFromText(
        base({
          mpgText: String(planned.save.mpgNeeded),
          referenceMph: 60,
          speedText: "60",
          saveText: "",
        }),
      ),
    );
    expect(atMpg.litres).toBeCloseTo(start.litres - 1, 5);
  });

  it("keeps the current speed when the saving is zero", () => {
    const planned = ok(playFuelFromText(base({ saveText: "0" })));
    expect(planned.save).toMatchObject({ ok: true, savedLitres: 0, speedMph: 60 });
  });

  it("explains a saving the drive cannot make", () => {
    const tooMuch = ok(playFuelFromText(base({ saveText: "20" })));
    expect(tooMuch.save).toEqual({
      ok: false,
      message: "That is more fuel than this drive uses.",
    });
    const negative = ok(playFuelFromText(base({ saveText: "-1" })));
    expect(negative.save).toEqual({
      ok: false,
      message: "You cannot save a negative amount of fuel.",
    });
    const crawl = ok(playFuelFromText(base({ saveText: "11" })));
    expect(crawl.save?.ok).toBe(false);
    if (crawl.save?.ok !== false) return;
    expect(crawl.save.message).toMatch(/slower than the 20 mph|crawl/);
  });
});
