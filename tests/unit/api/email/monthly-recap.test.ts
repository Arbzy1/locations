import { describe, expect, it } from "vitest";
import {
  lastCompleteMonthYm,
  recapVarsFromMonthly,
  shouldSendMonthlyRecap,
} from "@locations/api/monthly-recap";

describe("shouldSendMonthlyRecap", () => {
  it("skips demo, disabled, and already-sent months", () => {
    expect(
      shouldSendMonthlyRecap({ enabled: true, lastYm: null, role: "demo", monthYm: "2026-07" }),
    ).toBe(false);
    expect(
      shouldSendMonthlyRecap({ enabled: false, lastYm: null, role: "user", monthYm: "2026-07" }),
    ).toBe(false);
    expect(
      shouldSendMonthlyRecap({
        enabled: true,
        lastYm: "2026-07",
        role: "user",
        monthYm: "2026-07",
      }),
    ).toBe(false);
    expect(
      shouldSendMonthlyRecap({ enabled: true, lastYm: null, role: "user", monthYm: "2026-07" }),
    ).toBe(true);
  });
});

describe("recapVarsFromMonthly", () => {
  it("formats counts and distance without place names", () => {
    const vars = recapVarsFromMonthly(
      [{ month: "2026-07", days_tracked: 12, visits: 40, activities: 9, distance_miles: 31 }],
      "2026-07",
      "mi",
    );
    expect(vars?.daysTracked).toBe(12);
    expect(vars?.activityCount).toBe(9);
    expect(vars?.distanceLabel).toContain("mi");
    expect(JSON.stringify(vars)).not.toMatch(/lat|lon|takeout/i);
  });
});

describe("lastCompleteMonthYm", () => {
  it("returns the previous UTC month", () => {
    expect(lastCompleteMonthYm(new Date("2026-08-14T12:00:00Z"))).toBe("2026-07");
  });
});
