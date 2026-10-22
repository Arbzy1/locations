import { describe, expect, it } from "vitest";
import { roundBandPence, roundMoneyPence } from "\@locations/brim/engine/rounding.js";

describe("roundMoneyPence", () => {
  it("rounds to the pound when the band is wider than £2", () => {
    expect(roundMoneyPence(1395, 800, 2100)).toBe(1400);
    expect(roundMoneyPence(1349, 800, 2100)).toBe(1300);
  });

  it("rounds to ten pence when the band is £2 or less", () => {
    expect(roundMoneyPence(1395, 1300, 1490)).toBe(1400);
    expect(roundMoneyPence(1394, 1300, 1490)).toBe(1390);
  });
});

describe("roundBandPence", () => {
  it("applies the same rule to point, low, and high", () => {
    expect(
      roundBandPence({ point: 1395.9, low: 1297.1, high: 1494.7 }),
    ).toEqual({ point: 1400, low: 1300, high: 1490 });
  });
});
