import { describe, expect, it } from "vitest";
import {
  lastCompleteMonthYm,
  queryMonthlyRecapFallback,
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

describe("queryMonthlyRecapFallback", () => {
  it("computes monthly stats from visits and activities when analytics_cache is missing or stale", async () => {
    let call = 0;
    const mockDb = {
      select: () => ({
        from: () => ({
          where: async () => {
            call += 1;
            if (call === 1) {
              return [{ visits: 5, vDays: ["2026-07-01", "2026-07-02"] }];
            }
            return [{ activities: 3, meters: 16093.44, aDays: ["2026-07-02", "2026-07-04"] }];
          },
        }),
      }),
    };
    const vars = await queryMonthlyRecapFallback(mockDb as never, "user-a", "2026-07", "mi");
    expect(vars).toEqual({
      daysTracked: 3,
      visitCount: 5,
      activityCount: 3,
      distanceLabel: "10 mi",
      monthLabel: "July 2026",
    });
  });

  it("returns null when the user had zero visits and zero activities in that month", async () => {
    const mockDb = {
      select: () => ({
        from: () => ({
          where: async () => [{ visits: 0, activities: 0, meters: 0, vDays: [], aDays: [] }],
        }),
      }),
    };
    const vars = await queryMonthlyRecapFallback(mockDb as never, "user-a", "2026-07", "km");
    expect(vars).toBeNull();
  });
});
