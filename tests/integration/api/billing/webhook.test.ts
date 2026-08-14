import { beforeEach, describe, expect, it, vi } from "vitest";
import { testEnv, testExecutionCtx } from "@tests/helpers/env";

const { constructEventAsync, recordStripeEvent, syncSubscriptionFromStripe, tenantForStripeCustomer, retrieveSubscription } =
  vi.hoisted(() => ({
    constructEventAsync: vi.fn(),
    recordStripeEvent: vi.fn(),
    syncSubscriptionFromStripe: vi.fn(),
    tenantForStripeCustomer: vi.fn(),
    retrieveSubscription: vi.fn(async () => ({
      id: "sub_1",
      customer: "cus_1",
      status: "active",
      items: { data: [{ current_period_end: 1, price: { id: "price_x" } }] },
    })),
  }));

vi.mock("@locations/api/auth", () => ({
  createAuth: () => ({
    handler: async () => new Response("auth"),
    api: { getSession: async () => null },
  }),
}));

vi.mock("@locations/api/services", async () => {
  const { createServicesMock } = await import("@tests/helpers/api-app");
  return createServicesMock({
    emailForTenant: vi.fn(async () => ({ email: "a@example.com", role: "user" })),
  });
});

vi.mock("@locations/api/billing", () => ({
  stripeClient: () => ({
    webhooks: { constructEventAsync },
    subscriptions: { retrieve: retrieveSubscription },
  }),
  priceIdForInterval: () => "price_x",
  recordStripeEvent,
  syncSubscriptionFromStripe,
  tenantForStripeCustomer,
}));

import { app } from "@locations/api/index";

const env = testEnv({
  STRIPE_SECRET_KEY: "sk_test",
  STRIPE_WEBHOOK_SECRET: "whsec_test",
});

const executionCtx = testExecutionCtx();

describe("stripe webhook", () => {
  beforeEach(() => {
    constructEventAsync.mockReset();
    recordStripeEvent.mockReset();
    syncSubscriptionFromStripe.mockReset();
  });

  it("rejects missing signature", async () => {
    const res = await app.request("/api/billing/webhook", { method: "POST", body: "{}" }, env, executionCtx);
    expect(res.status).toBe(400);
  });

  it("rejects invalid signature", async () => {
    constructEventAsync.mockRejectedValue(new Error("bad sig"));
    const res = await app.request(
      "/api/billing/webhook",
      { method: "POST", headers: { "stripe-signature": "t=1,v1=x" }, body: "{}" },
      env,
      executionCtx,
    );
    expect(res.status).toBe(400);
  });

  it("is idempotent on duplicate event ids", async () => {
    constructEventAsync.mockResolvedValue({
      id: "evt_1",
      type: "customer.subscription.updated",
      data: { object: { id: "sub_1", metadata: { tenant: "u1" } } },
    });
    recordStripeEvent.mockResolvedValue(false);
    const res = await app.request(
      "/api/billing/webhook",
      { method: "POST", headers: { "stripe-signature": "t=1,v1=x" }, body: "{}" },
      env,
      executionCtx,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ duplicate: true });
    expect(syncSubscriptionFromStripe).not.toHaveBeenCalled();
  });

  it("still returns 200 when billing mail is skipped without a Resend key", async () => {
    constructEventAsync.mockResolvedValue({
      id: "evt_checkout",
      type: "checkout.session.completed",
      data: {
        object: {
          customer: "cus_1",
          subscription: "sub_1",
          client_reference_id: "u1",
          metadata: { tenant: "u1" },
        },
      },
    });
    recordStripeEvent.mockResolvedValue(true);
    const res = await app.request(
      "/api/billing/webhook",
      { method: "POST", headers: { "stripe-signature": "t=1,v1=x" }, body: "{}" },
      env,
      executionCtx,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ received: true });
    expect(syncSubscriptionFromStripe).toHaveBeenCalled();
  });
});
