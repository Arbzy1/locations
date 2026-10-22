import { describe, expect, it } from "vitest";
import { hmrcAmapPence, ukTaxYearStartUtc } from "\@locations/brim/shared/hmrc.js";

describe("HMRC AMAP", () => {
  it("uses 45p until 10,000 miles then 25p, including a crossing journey", () => {
    const split = hmrcAmapPence(200, 9_900);
    expect(split.bandMiles45).toBe(100);
    expect(split.bandMiles25).toBe(100);
    expect(split.approvedPence).toBe(100 * 45 + 100 * 25);
    expect(split.crossedThreshold).toBe(true);
  });

  it("stays on 45p below the threshold", () => {
    const flat = hmrcAmapPence(50, 100);
    expect(flat.bandMiles25).toBe(0);
    expect(flat.approvedPence).toBe(50 * 45);
  });

  it("uses 45p for the whole journey when YTD is 0", () => {
    const r = hmrcAmapPence(80, 0);
    expect(r.bandMiles45).toBe(80);
    expect(r.bandMiles25).toBe(0);
    expect(r.approvedPence).toBe(80 * 45);
    expect(r.crossedThreshold).toBe(false);
  });

  it("uses 25p once YTD is exactly 10,000", () => {
    const r = hmrcAmapPence(20, 10_000);
    expect(r.bandMiles45).toBe(0);
    expect(r.bandMiles25).toBe(20);
    expect(r.approvedPence).toBe(20 * 25);
    expect(r.crossedThreshold).toBe(false);
  });
});

describe("ukTaxYearStartUtc", () => {
  it("starts on 6 April", () => {
    expect(ukTaxYearStartUtc("2026-04-06T00:00:00Z")).toBe("2026-04-06T00:00:00.000Z");
    expect(ukTaxYearStartUtc("2026-04-05T23:00:00Z")).toBe("2025-04-06T00:00:00.000Z");
    expect(ukTaxYearStartUtc("2026-01-15T12:00:00Z")).toBe("2025-04-06T00:00:00.000Z");
  });
});
