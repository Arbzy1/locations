import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testEnv, testExecutionCtx } from "@tests/helpers/env";
import { parseResendCall, stripeSubscription, stubResendFetch } from "@tests/helpers/vendors";

const {
  constructEventAsync,
  recordStripeEvent,
  syncSubscriptionFromStripe,
  tenantForStripeCustomer,
  retrieveSubscription,
} = vi.hoisted(() => ({
  constructEventAsync: vi.fn(),
  recordStripeEvent: vi.fn(),
  syncSubscriptionFromStripe: vi.fn(),
  tenantForStripeCustomer: vi.fn(),
  retrieveSubscription: vi.fn(async () => ({
    id: "sub_1",
    customer: "cus_1",
    status: "active",
    metadata: { tenant: "u1" },
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
  stripeClient: (env: { STRIPE_SECRET_KEY?: string; STRIPE_WEBHOOK_SECRET?: string }) =>
    env.STRIPE_SECRET_KEY
      ? {
          webhooks: { constructEventAsync },
          subscriptions: { retrieve: retrieveSubscription },
        }
      : null,
  priceIdForInterval: () => "price_x",
  recordStripeEvent,
  syncSubscriptionFromStripe,
  tenantForStripeCustomer,
}));

import { app } from "@locations/api/index";
import { emailForTenant } from "@locations/api/services";

const env = testEnv({
  STRIPE_SECRET_KEY: "sk_test",
  STRIPE_WEBHOOK_SECRET: "whsec_test",
});

const executionCtx = testExecutionCtx();

async function postWebhook(
  event: unknown,
  requestEnv = env,
  headers: Record<string, string> = { "stripe-signature": "t=1,v1=x" },
) {
  if (event) constructEventAsync.mockResolvedValue(event);
  return app.request(
    "/api/billing/webhook",
    { method: "POST", headers, body: "{}" },
    requestEnv,
    executionCtx,
  );
}

describe("stripe webhook", () => {
  beforeEach(() => {
    constructEventAsync.mockReset();
    recordStripeEvent.mockReset();
    syncSubscriptionFromStripe.mockReset();
    retrieveSubscription.mockReset();
    retrieveSubscription.mockResolvedValue(stripeSubscription({ tenant: "u1" }));
    recordStripeEvent.mockResolvedValue(true);
    vi.mocked(emailForTenant).mockResolvedValue({ email: "a@example.com", role: "user" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 503 when billing is unset", async () => {
    const res = await postWebhook(null, testEnv(), { "stripe-signature": "t=1,v1=x" });
    expect(res.status).toBe(503);
    expect(constructEventAsync).not.toHaveBeenCalled();
  });

  it("rejects missing signature", async () => {
    const res = await app.request(
      "/api/billing/webhook",
      { method: "POST", body: "{}" },
      env,
      executionCtx,
    );
    expect(res.status).toBe(400);
  });

  it("rejects invalid signature", async () => {
    constructEventAsync.mockRejectedValue(new Error("bad sig"));
    const res = await postWebhook(null);
    expect(res.status).toBe(400);
  });

  it("is idempotent on duplicate event ids", async () => {
    recordStripeEvent.mockResolvedValue(false);
    const res = await postWebhook({
      id: "evt_1",
      type: "customer.subscription.updated",
      data: { object: { id: "sub_1", metadata: { tenant: "u1" } } },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ duplicate: true });
    expect(syncSubscriptionFromStripe).not.toHaveBeenCalled();
  });

  it("grants access after checkout.session.completed", async () => {
    retrieveSubscription.mockResolvedValue(
      stripeSubscription({ status: "active", tenant: "u1" }),
    );
    const res = await postWebhook({
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
    expect(res.status).toBe(200);
    expect(retrieveSubscription).toHaveBeenCalledWith("sub_1");
    expect(syncSubscriptionFromStripe).toHaveBeenCalledWith(
      expect.anything(),
      env,
      expect.objectContaining({ status: "active" }),
      "u1",
    );
  });

  it("syncs an active subscription.updated without sending subscription_active mail", async () => {
    const fetchMock = stubResendFetch();
    retrieveSubscription.mockResolvedValue(
      stripeSubscription({ status: "active", tenant: "u1" }),
    );
    const res = await postWebhook(
      {
        id: "evt_active",
        type: "customer.subscription.updated",
        data: { object: { id: "sub_1", metadata: { tenant: "u1" } } },
      },
      testEnv({
        STRIPE_SECRET_KEY: "sk_test",
        STRIPE_WEBHOOK_SECRET: "whsec_test",
        RESEND_API_KEY: "re_test",
      }),
    );
    expect(res.status).toBe(200);
    expect(syncSubscriptionFromStripe).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ status: "active" }),
      "u1",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("revokes access on past_due and emails subscription_past_due", async () => {
    const fetchMock = stubResendFetch();
    retrieveSubscription.mockResolvedValue(
      stripeSubscription({ status: "past_due", tenant: "u1" }),
    );
    const res = await postWebhook(
      {
        id: "evt_past_due",
        type: "customer.subscription.updated",
        data: { object: { id: "sub_1", metadata: { tenant: "u1" } } },
      },
      testEnv({
        STRIPE_SECRET_KEY: "sk_test",
        STRIPE_WEBHOOK_SECRET: "whsec_test",
        RESEND_API_KEY: "re_test",
      }),
    );
    expect(res.status).toBe(200);
    expect(syncSubscriptionFromStripe).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ status: "past_due" }),
      "u1",
    );
    const { url, headers, body } = parseResendCall(fetchMock);
    expect(url).toBe("https://api.resend.com/emails");
    expect(headers["Idempotency-Key"]).toBe("evt_past_due");
    expect(body.tags[0].value).toBe("subscription_past_due");
    expect(body.text.toLowerCase()).not.toMatch(/\blat\b|\blon\b|takeout/);
  });

  it("revokes access on canceled and emails subscription_canceled", async () => {
    const fetchMock = stubResendFetch();
    retrieveSubscription.mockResolvedValue(
      stripeSubscription({ status: "canceled", tenant: "u1" }),
    );
    const res = await postWebhook(
      {
        id: "evt_canceled",
        type: "customer.subscription.deleted",
        data: { object: { id: "sub_1", metadata: { tenant: "u1" } } },
      },
      testEnv({
        STRIPE_SECRET_KEY: "sk_test",
        STRIPE_WEBHOOK_SECRET: "whsec_test",
        RESEND_API_KEY: "re_test",
      }),
    );
    expect(res.status).toBe(200);
    expect(syncSubscriptionFromStripe).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ status: "canceled" }),
      "u1",
    );
    expect(parseResendCall(fetchMock).body.tags[0].value).toBe("subscription_canceled");
  });

  it("emails subscription_active after checkout when Resend is configured", async () => {
    const fetchMock = stubResendFetch();
    retrieveSubscription.mockResolvedValue(
      stripeSubscription({ status: "active", tenant: "u1" }),
    );
    const res = await postWebhook(
      {
        id: "evt_checkout_mail",
        type: "checkout.session.completed",
        data: {
          object: {
            subscription: "sub_1",
            client_reference_id: "u1",
            metadata: { tenant: "u1" },
          },
        },
      },
      testEnv({
        STRIPE_SECRET_KEY: "sk_test",
        STRIPE_WEBHOOK_SECRET: "whsec_test",
        RESEND_API_KEY: "re_test",
      }),
    );
    expect(res.status).toBe(200);
    expect(parseResendCall(fetchMock).body.tags[0].value).toBe("subscription_active");
  });

  it("still returns 200 when billing mail is skipped without a Resend key", async () => {
    const res = await postWebhook({
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
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ received: true });
    expect(syncSubscriptionFromStripe).toHaveBeenCalled();
  });

  it("skips Resend for demo recipients and still returns 200", async () => {
    const fetchMock = stubResendFetch();
    vi.mocked(emailForTenant).mockResolvedValue({ email: "demo@locations.app", role: "demo" });
    retrieveSubscription.mockResolvedValue(
      stripeSubscription({ status: "past_due", tenant: "u1" }),
    );
    const res = await postWebhook(
      {
        id: "evt_demo",
        type: "customer.subscription.updated",
        data: { object: { id: "sub_1", metadata: { tenant: "u1" } } },
      },
      testEnv({
        STRIPE_SECRET_KEY: "sk_test",
        STRIPE_WEBHOOK_SECRET: "whsec_test",
        RESEND_API_KEY: "re_test",
        DEMO_EMAIL: "demo@locations.app",
      }),
    );
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 200 when Resend is down", async () => {
    stubResendFetch({ status: 500, body: "nope" });
    retrieveSubscription.mockResolvedValue(
      stripeSubscription({ status: "past_due", tenant: "u1" }),
    );
    const res = await postWebhook(
      {
        id: "evt_mail_fail",
        type: "customer.subscription.updated",
        data: { object: { id: "sub_1", metadata: { tenant: "u1" } } },
      },
      testEnv({
        STRIPE_SECRET_KEY: "sk_test",
        STRIPE_WEBHOOK_SECRET: "whsec_test",
        RESEND_API_KEY: "re_test",
      }),
    );
    expect(res.status).toBe(200);
  });
});
