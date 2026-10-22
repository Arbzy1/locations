import { describe, expect, it } from "vitest";
import { calibrateFromFillUps, type FillUpSample } from "\@locations/brim/engine/consumption/calibrate.js";

function brim(odometerMiles: number, quantity: number, unit: FillUpSample["unit"] = "litres"): FillUpSample {
  return { odometerMiles, quantity, unit, filledToBrim: true };
}

function splash(odometerMiles: number, quantity: number): FillUpSample {
  return { odometerMiles, quantity, unit: "litres", filledToBrim: false };
}

describe("calibrateFromFillUps", () => {
  it("needs two brim fills to form one interval", () => {
    expect(calibrateFromFillUps([brim(1000, 40)], "liquid")).toBeUndefined();
    const one = calibrateFromFillUps([brim(1000, 40), brim(1100, 40)], "liquid");
    expect(one?.sampleCount).toBe(1);
    expect(one?.unit).toBe("l/100km");
  });

  it("returns three intervals from four brim fills", () => {
    const r = calibrateFromFillUps(
      [brim(10000, 50), brim(10300, 40), brim(10600, 40), brim(10900, 40)],
      "liquid",
    );
    expect(r?.sampleCount).toBe(3);
    const km = 300 * 1.609344;
    expect(r?.value).toBeCloseTo((40 / km) * 100, 6);
  });

  it("skips non-brim as endpoints but counts their quantity", () => {
    const r = calibrateFromFillUps(
      [brim(10000, 50), splash(10150, 10), brim(10300, 30)],
      "liquid",
    );
    expect(r?.sampleCount).toBe(1);
    const km = 300 * 1.609344;
    expect(r?.value).toBeCloseTo((40 / km) * 100, 6);
  });

  it("rejects odometer rollback", () => {
    const r = calibrateFromFillUps(
      [
        { ...brim(10000, 40), occurredAt: "2026-01-01T00:00:00Z" },
        { ...brim(9900, 40), occurredAt: "2026-02-01T00:00:00Z" },
        { ...brim(10300, 40), occurredAt: "2026-03-01T00:00:00Z" },
      ],
      "liquid",
    );
    expect(r?.sampleCount).toBe(1);
    const km = 300 * 1.609344;
    expect(r?.value).toBeCloseTo((40 / km) * 100, 6);
  });

  it("ignores electric samples on the liquid path", () => {
    const r = calibrateFromFillUps(
      [brim(1000, 20, "kwh"), brim(1100, 20, "kwh"), brim(1000, 40), brim(1100, 40)],
      "liquid",
    );
    expect(r?.sampleCount).toBe(1);
    expect(r?.unit).toBe("l/100km");
  });

  it("computes EV kWh/100km from full charges", () => {
    const r = calibrateFromFillUps(
      [
        brim(1000, 40, "kwh"),
        brim(1100, 16, "kwh"),
        brim(1200, 16, "kwh"),
        brim(1300, 16, "kwh"),
      ],
      "electric",
    );
    expect(r?.sampleCount).toBe(3);
    expect(r?.unit).toBe("kWh/100km");
    const km = 100 * 1.609344;
    expect(r?.value).toBeCloseTo((16 / km) * 100, 6);
  });

  it("omits stddev until there are two intervals", () => {
    const one = calibrateFromFillUps([brim(1, 10), brim(101, 10)], "liquid");
    expect(one?.stddev).toBeUndefined();
    const two = calibrateFromFillUps([brim(1, 10), brim(101, 10), brim(201, 20)], "liquid");
    expect(two?.stddev).toBeGreaterThan(0);
  });

  it("drops zero-quantity and non-finite odometer rows", () => {
    expect(
      calibrateFromFillUps(
        [brim(1000, 0), brim(1100, 40), { odometerMiles: Number.NaN, quantity: 40, unit: "litres", filledToBrim: true }],
        "liquid",
      ),
    ).toBeUndefined();
  });

  it("drops intervals shorter than 20 miles as odometer noise", () => {
    expect(
      calibrateFromFillUps(
        [brim(1000, 40), brim(1010, 40), brim(1020, 40), brim(1030, 40)],
        "liquid",
      ),
    ).toBeUndefined();
  });
});
