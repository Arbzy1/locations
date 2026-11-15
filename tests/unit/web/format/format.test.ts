import { describe, expect, it } from "vitest";
import { formatDistance, formatDuration, formatMilesOrKm } from "@locations/web/utils/format";

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

  it("keeps a short stay in minutes and an exact hour without a zero minute part", () => {
    expect(formatDuration(0.4)).toBe("< 1 min");
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(5 * 60 + 12)).toBe("5h 12m");
  });

  it("leads with days and keeps the remainder", () => {
    expect(formatDuration(24 * 60)).toBe("1d");
    expect(formatDuration(36 * 60)).toBe("1d 12h");
    expect(formatDuration(24 * 60 + 30)).toBe("1d 30m");
    expect(formatDuration(2 * 24 * 60 + 3 * 60 + 15)).toBe("2d 3h 15m");
  });
});
