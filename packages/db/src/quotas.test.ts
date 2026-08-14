import { describe, expect, it } from "vitest";
import { PLAN_QUOTAS, quotaForEntitled } from "./quotas.js";

describe("quotaForEntitled", () => {
  it("uses pro when entitled", () => {
    expect(quotaForEntitled(true)).toEqual(PLAN_QUOTAS.pro);
    expect(quotaForEntitled(false)).toEqual(PLAN_QUOTAS.free);
  });

  it("caps free sources at 1", () => {
    expect(PLAN_QUOTAS.free.maxSources).toBe(1);
    expect(PLAN_QUOTAS.pro.maxSources).toBeGreaterThan(1);
  });
});
