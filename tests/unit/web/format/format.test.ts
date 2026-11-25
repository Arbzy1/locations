import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDistance,
  formatDuration,
  formatMilesOrKm,
  formatTime,
  isValidIanaTimeZone,
  resolveSafeTimeZone,
} from "@locations/web/utils/format";

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

describe("IANA timezone validation and fallback", () => {
  it("accepts valid IANA timezones and rejects invalid strings", () => {
    expect(isValidIanaTimeZone("UTC")).toBe(true);
    expect(isValidIanaTimeZone("Europe/London")).toBe(true);
    expect(isValidIanaTimeZone("America/Los_Angeles")).toBe(true);
    expect(isValidIanaTimeZone("")).toBe(false);
    expect(isValidIanaTimeZone("   ")).toBe(false);
    expect(isValidIanaTimeZone("Mars/Olympus_Mons")).toBe(false);
  });

  it("resolves invalid timezones cleanly to UTC while preserving empty/null as undefined", () => {
    expect(resolveSafeTimeZone(undefined)).toBeUndefined();
    expect(resolveSafeTimeZone(null)).toBeUndefined();
    expect(resolveSafeTimeZone("")).toBeUndefined();
    expect(resolveSafeTimeZone("  Europe/London ")).toBe("Europe/London");
    expect(resolveSafeTimeZone("Not/A_Zone")).toBe("UTC");
  });

  it("never throws RangeError in formatTime when given an invalid timezone", () => {
    expect(() => formatTime("2026-11-24T14:35:00Z", "Invalid/Timezone")).not.toThrow();
    expect(formatTime("2026-11-24T14:35:00Z", "Invalid/Timezone")).toBe("14:35");
    expect(formatTime("2026-11-24T14:35:00Z", "UTC")).toBe("14:35");
  });

  it("never shifts YYYY-MM-DD calendar dates backward in western timezones or throws on invalid zones", () => {
    expect(formatDate("2026-03-15", "America/Los_Angeles")).toContain("15 Mar 2026");
    expect(formatDate("2026-03-15", "Pacific/Honolulu")).toContain("15 Mar 2026");
    expect(formatDate("2026-03-15", "America/New_York")).toContain("15 Mar 2026");
    expect(formatDate("2026-03-15", "Asia/Tokyo")).toContain("15 Mar 2026");
    expect(() => formatDate("2026-03-15", "Bad/Zone")).not.toThrow();
    expect(formatDate("2026-03-15", "Bad/Zone")).toContain("15 Mar 2026");
    expect(() => formatDate("2026-03-15T23:30:00Z", "Bad/Zone")).not.toThrow();
    expect(formatDate("2026-03-15T23:30:00Z", "Bad/Zone")).toContain("15 Mar 2026");
  });
});
