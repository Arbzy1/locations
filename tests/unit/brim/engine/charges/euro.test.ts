import { describe, expect, it } from "vitest";
import { deriveEuroFromYear, parseEuroStatus, resolveEuro } from "\@locations/brim/engine/charges/euro.js";

describe("parseEuroStatus", () => {
  it("reads numerals and roman forms", () => {
    expect(parseEuroStatus("EURO 6")).toBe(6);
    expect(parseEuroStatus("Euro 5")).toBe(5);
    expect(parseEuroStatus("euro_iv")).toBe(4);
    expect(parseEuroStatus("Euro VI")).toBe(6);
    expect(parseEuroStatus(undefined)).toBeUndefined();
    expect(parseEuroStatus("unknown")).toBeUndefined();
  });
});

describe("deriveEuroFromYear", () => {
  it("treats a 2015 diesel as Euro 5, not Euro 6", () => {
    expect(deriveEuroFromYear("diesel", "car", 2015)).toBe(5);
    expect(deriveEuroFromYear("diesel", "car", 2016)).toBe(6);
  });

  it("treats a 2015 petrol as Euro 6", () => {
    expect(deriveEuroFromYear("petrol", "car", 2015)).toBe(6);
    expect(deriveEuroFromYear("petrol", "car", 2010)).toBe(4);
  });

  it("uses motorcycle year bands", () => {
    expect(deriveEuroFromYear("petrol", "motorcycle", 2017)).toBe(4);
    expect(deriveEuroFromYear("petrol", "motorcycle", 2007)).toBe(3);
    expect(deriveEuroFromYear("petrol", "motorcycle", 2000)).toBe(2);
  });
});

describe("resolveEuro", () => {
  it("keeps a DVLA string as a DVLA fact", () => {
    const r = resolveEuro({
      euroStatus: "Euro 6",
      euroStatusSource: "dvla",
      propulsion: "diesel",
      kind: "car",
      year: 2015,
    });
    expect(r).toEqual({ euro: 6, source: "dvla", derived: false });
  });

  it("marks year derivation so callers cannot present it as DVLA", () => {
    const r = resolveEuro({
      propulsion: "diesel",
      kind: "car",
      year: 2015,
    });
    expect(r.euro).toBe(5);
    expect(r.source).toBe("derived");
    expect(r.derived).toBe(true);
  });
});
