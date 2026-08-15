import { describe, expect, it } from "vitest";
import {
  detectTimelineFormat,
  importDayDiff,
  timezoneSkewWarning,
} from "@locations/db";

describe("detectTimelineFormat", () => {
  it("detects classic arrays", () => {
    expect(detectTimelineFormat([{ startTime: "2024-01-01T00:00:00Z" }])).toBe("classic");
  });

  it("detects semantic segments", () => {
    expect(detectTimelineFormat({ semanticSegments: [] })).toBe("semantic");
  });

  it("rejects Settings.json", () => {
    expect(() => detectTimelineFormat({ timelineEnabled: true })).toThrow(/Timeline JSON/);
  });
});

describe("importDayDiff", () => {
  it("counts overlapping vs new days", () => {
    const diff = importDayDiff(["2024-01-01", "2024-01-02", "2024-01-03"], ["2024-01-02", "2024-01-04"]);
    expect(diff.overlappingDays).toBe(1);
    expect(diff.newDays).toBe(2);
    expect(diff.existingDays).toBe(2);
    expect(diff.overlappingSample).toEqual(["2024-01-02"]);
  });
});

describe("timezoneSkewWarning", () => {
  it("does not warn when UTC dates match the stored date", () => {
    const visits = Array.from({ length: 10 }, (_, i) => ({
      start: `2024-06-01T10:0${i}:00Z`,
      date: "2024-06-01",
    }));
    const result = timezoneSkewWarning(visits, "UTC");
    expect(result.warn).toBe(false);
    expect(result.sampleCount).toBe(10);
  });

  it("warns when a large share sits on a different local day", () => {
    const visits = Array.from({ length: 10 }, () => ({
      start: "2024-06-01T22:00:00Z",
      date: "2024-06-01",
    }));
    const result = timezoneSkewWarning(visits, "Pacific/Auckland");
    expect(result.sampleCount).toBe(10);
    expect(result.skewedShare).toBeGreaterThanOrEqual(0.15);
    expect(result.warn).toBe(true);
  });
});
