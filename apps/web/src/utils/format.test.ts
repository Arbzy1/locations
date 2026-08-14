import { describe, expect, it } from "vitest";
import { formatDistance, formatDuration, formatMilesOrKm } from "./format";

describe("formatDistance", () => {
  it("formats miles by default", () => {
    expect(formatDistance(1609.34)).toMatch(/mi/);
  });

  it("formats kilometres", () => {
    expect(formatDistance(1000, "km")).toBe("1.0 km");
  });
});

describe("formatMilesOrKm", () => {
  it("converts stored miles to km", () => {
    expect(formatMilesOrKm(1, "km")).toMatch(/km/);
  });
});

describe("formatDuration", () => {
  it("formats hours", () => {
    expect(formatDuration(90)).toBe("1h 30m");
  });
});
