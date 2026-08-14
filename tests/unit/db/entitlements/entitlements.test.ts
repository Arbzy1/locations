import { describe, expect, it } from "vitest";
import { graceUntilFromPeriodEnd, isEntitled, isReadOnlyGrace, subscriptionAllowsImport } from "@locations/db";

describe("isEntitled", () => {
  it("allows demo without a subscription", () => {
    expect(isEntitled(null, { isDemo: true })).toBe(true);
  });

  it("denies missing subscription", () => {
    expect(isEntitled(null)).toBe(false);
  });

  it("allows active and trialing", () => {
    expect(isEntitled({ status: "active", graceUntil: null })).toBe(true);
    expect(isEntitled({ status: "trialing", graceUntil: null })).toBe(true);
  });

  it("allows grace window", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    expect(
      isEntitled(
        { status: "past_due", graceUntil: new Date("2026-01-03T00:00:00Z") },
        { now },
      ),
    ).toBe(true);
  });
});

describe("isReadOnlyGrace", () => {
  it("is true only during grace after paid status ends", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    expect(
      isReadOnlyGrace(
        { status: "past_due", graceUntil: new Date("2026-01-02T00:00:00Z") },
        { now },
      ),
    ).toBe(true);
    expect(isReadOnlyGrace({ status: "active", graceUntil: null }, { now })).toBe(false);
  });
});

describe("subscriptionAllowsImport", () => {
  it("allows active and trialing only", () => {
    expect(subscriptionAllowsImport("active")).toBe(true);
    expect(subscriptionAllowsImport("past_due")).toBe(false);
  });
});

describe("graceUntilFromPeriodEnd", () => {
  it("adds default days", () => {
    const end = new Date("2026-01-01T00:00:00Z");
    const g = graceUntilFromPeriodEnd(end, 3)!;
    expect(g.toISOString()).toBe("2026-01-04T00:00:00.000Z");
  });
});
