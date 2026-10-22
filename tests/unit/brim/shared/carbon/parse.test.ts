import { describe, expect, it } from "vitest";
import {
  carbonIntensityRangeUrl,
  gridIntensityReason,
  parseCarbonIntensity,
  pickGridIntensity,
  toCarbonStamp,
} from "\@locations/brim/shared/carbon/index.js";

const sample = {
  data: [
    {
      from: "2026-08-16T11:30Z",
      to: "2026-08-16T12:00Z",
      intensity: { forecast: 200, actual: 185, index: "moderate" },
    },
    {
      from: "2026-08-16T12:00Z",
      to: "2026-08-16T12:30Z",
      intensity: { forecast: 190, actual: null, index: "moderate" },
    },
  ],
};

describe("parseCarbonIntensity", () => {
  it("prefers actual over forecast", () => {
    const rows = parseCarbonIntensity(sample);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.intensityGPerKwh).toBe(185);
    expect(rows[0]?.source).toBe("actual");
    expect(rows[1]?.intensityGPerKwh).toBe(190);
    expect(rows[1]?.source).toBe("forecast");
  });
});

describe("pickGridIntensity", () => {
  it("selects the half-hour containing leave time", () => {
    const rows = parseCarbonIntensity(sample);
    const atNoon = pickGridIntensity(rows, "2026-08-16T12:00:00Z");
    expect(atNoon?.intensityGPerKwh).toBe(190);
    const before = pickGridIntensity(rows, "2026-08-16T11:45:00Z");
    expect(before?.intensityGPerKwh).toBe(185);
    expect(pickGridIntensity(rows, "1970-01-01T00:00:00Z")).toBeUndefined();
  });
});

describe("gridIntensityReason", () => {
  it("names the national series or the 150 fallback", () => {
    const rows = parseCarbonIntensity(sample);
    const hit = pickGridIntensity(rows, "2026-08-16T12:00:00Z");
    expect(gridIntensityReason(hit)).toMatch(/national GB forecast grid carbon intensity/);
    expect(gridIntensityReason(undefined)).toMatch(/150 g\/kWh/);
  });
});

describe("carbonIntensityRangeUrl", () => {
  it("uses the Carbon Intensity stamp format", () => {
    expect(toCarbonStamp("2026-08-16T12:00:00.000Z")).toBe("2026-08-16T12:00Z");
    expect(carbonIntensityRangeUrl("2026-08-14T12:00:00Z", "2026-08-18T12:00:00Z")).toBe(
      "https://api.carbonintensity.org.uk/intensity/2026-08-14T12:00Z/2026-08-18T12:00Z",
    );
  });
});
