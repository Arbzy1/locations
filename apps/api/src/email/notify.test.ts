import { describe, expect, it } from "vitest";
import { billingEmailKind, isDemoRecipient } from "./notify";
import type { Env } from "../env";

const env = { DEMO_EMAIL: "demo@locations.app" } as Env;

describe("billingEmailKind", () => {
  it("sends active only after checkout, not on later active updates", () => {
    expect(billingEmailKind("checkout.session.completed", "active")).toBe("subscription_active");
    expect(billingEmailKind("customer.subscription.updated", "active")).toBeNull();
    expect(billingEmailKind("customer.subscription.updated", "trialing")).toBeNull();
  });

  it("maps past_due, unpaid, and canceled", () => {
    expect(billingEmailKind("customer.subscription.updated", "past_due")).toBe("subscription_past_due");
    expect(billingEmailKind("customer.subscription.updated", "unpaid")).toBe("subscription_past_due");
    expect(billingEmailKind("customer.subscription.updated", "canceled")).toBe("subscription_canceled");
    expect(billingEmailKind("customer.subscription.deleted", "canceled")).toBe("subscription_canceled");
  });
});

describe("isDemoRecipient", () => {
  it("matches demo role or DEMO_EMAIL", () => {
    expect(isDemoRecipient(env, "a@example.com", "demo")).toBe(true);
    expect(isDemoRecipient(env, "demo@locations.app", "user")).toBe(true);
    expect(isDemoRecipient(env, "a@example.com", "user")).toBe(false);
  });
});
