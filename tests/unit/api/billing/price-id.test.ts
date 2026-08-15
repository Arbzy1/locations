import { describe, expect, it } from "vitest";
import { priceIdForInterval } from "@locations/api/billing";
import type { Env } from "@locations/api/env";

const env = {
  STRIPE_PRICE_MONTHLY: "price_m",
  STRIPE_PRICE_YEARLY: "price_y",
} as Env;

describe("priceIdForInterval", () => {
  it("picks env prices", () => {
    expect(priceIdForInterval(env, "monthly")).toBe("price_m");
    expect(priceIdForInterval(env, "yearly")).toBe("price_y");
  });
});
