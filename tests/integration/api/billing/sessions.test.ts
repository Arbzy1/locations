import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestApp, sessionUser } from "@tests/helpers/api-app";
import { testEnv } from "@tests/helpers/env";
import type { Env } from "@locations/api/env";

const getSession = vi.fn();
const { stripe } = vi.hoisted(() => ({
  stripe: {
    checkout: {
      sessions: {
        create: vi.fn(async () => ({ url: "https://checkout.stripe.test/cs_test" })),
      },
    },
    billingPortal: {
      sessions: {
        create: vi.fn(async () => ({ url: "https://billing.stripe.test/bps_test" })),
      },
    },
    customers: { del: vi.fn(async () => ({ deleted: true, id: "cus_1" })) },
    webhooks: { constructEventAsync: vi.fn() },
    subscriptions: { retrieve: vi.fn(async () => ({ id: "sub_1" })) },
  },
}));

vi.mock("@locations/api/auth", () => ({
  createAuth: () => ({
    handler: async () => new Response("auth"),
    api: { getSession: (...args: unknown[]) => getSession(...args) },
  }),
}));

vi.mock("@locations/api/services", async () => {
  const { createServicesMock } = await import("@tests/helpers/api-app");
  return createServicesMock();
});

vi.mock("@locations/api/billing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@locations/api/billing")>();
  return {
    ...actual,
    stripeClient: (env: Env) => (env.STRIPE_SECRET_KEY ? stripe : null),
  };
});

import { app } from "@locations/api/index";
import { getSubscription } from "@locations/api/services";

const billed = {
  STRIPE_SECRET_KEY: "sk_test",
  STRIPE_PRICE_MONTHLY: "price_monthly",
  STRIPE_PRICE_YEARLY: "price_yearly",
} as const;

function env(overrides: Partial<Env> = {}) {
  return testEnv({ ...billed, ...overrides });
}

function request(path: string, init?: RequestInit, requestEnv: Env = env()) {
  return requestApp(app, path, init, requestEnv);
}

describe("POST /api/billing/checkout", () => {
  beforeEach(() => {
    getSession.mockReset();
    stripe.checkout.sessions.create.mockClear();
    vi.mocked(getSubscription).mockReset();
    vi.mocked(getSubscription).mockResolvedValue(null);
  });

  it("rejects unauthenticated access", async () => {
    getSession.mockResolvedValue(null);
    const res = await request("/api/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ interval: "monthly" }),
    });
    expect(res.status).toBe(401);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("blocks demo users", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "demo-1", role: "demo" }));
    const res = await request("/api/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ interval: "monthly" }),
    });
    expect(res.status).toBe(403);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("returns 503 when billing is unset", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    const res = await request(
      "/api/billing/checkout",
      { method: "POST", body: JSON.stringify({ interval: "monthly" }) },
      testEnv(),
    );
    expect(res.status).toBe(503);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("returns 503 when the price id is missing", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    const res = await request(
      "/api/billing/checkout",
      { method: "POST", body: JSON.stringify({ interval: "monthly" }) },
      env({ STRIPE_PRICE_MONTHLY: undefined }),
    );
    expect(res.status).toBe(503);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("creates a checkout session with server price ids and session tenant", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a", email: "a@example.com" }));
    const res = await request("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interval: "yearly", priceId: "price_from_client" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://checkout.stripe.test/cs_test" });
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        customer_email: "a@example.com",
        line_items: [{ price: "price_yearly", quantity: 1 }],
        client_reference_id: "user-a",
        metadata: { tenant: "user-a" },
        subscription_data: { metadata: { tenant: "user-a" } },
      }),
    );
    const arg = stripe.checkout.sessions.create.mock.calls[0]?.[0] as {
      line_items: Array<{ price: string }>;
    };
    expect(arg.line_items[0].price).not.toBe("price_from_client");
  });

  it("reuses an existing Stripe customer and ignores client customerId", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    vi.mocked(getSubscription).mockResolvedValue({
      stripeCustomerId: "cus_stored",
    } as never);
    await request("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interval: "monthly", customerId: "cus_from_client" }),
    });
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_stored",
        customer_email: undefined,
      }),
    );
  });
});

describe("POST /api/billing/portal", () => {
  beforeEach(() => {
    getSession.mockReset();
    stripe.billingPortal.sessions.create.mockClear();
    vi.mocked(getSubscription).mockReset();
    vi.mocked(getSubscription).mockResolvedValue(null);
  });

  it("rejects unauthenticated access", async () => {
    getSession.mockResolvedValue(null);
    const res = await request("/api/billing/portal", { method: "POST", body: "{}" });
    expect(res.status).toBe(401);
    expect(stripe.billingPortal.sessions.create).not.toHaveBeenCalled();
  });

  it("blocks demo users", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "demo-1", role: "demo" }));
    const res = await request("/api/billing/portal", { method: "POST", body: "{}" });
    expect(res.status).toBe(403);
    expect(stripe.billingPortal.sessions.create).not.toHaveBeenCalled();
  });

  it("returns 503 when billing is unset", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    const res = await request("/api/billing/portal", { method: "POST", body: "{}" }, testEnv());
    expect(res.status).toBe(503);
  });

  it("returns 404 when there is no Stripe customer", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    const res = await request("/api/billing/portal", { method: "POST", body: "{}" });
    expect(res.status).toBe(404);
    expect(stripe.billingPortal.sessions.create).not.toHaveBeenCalled();
  });

  it("opens the portal for the stored customer, not a client customerId", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    vi.mocked(getSubscription).mockResolvedValue({
      stripeCustomerId: "cus_stored",
    } as never);
    const res = await request("/api/billing/portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId: "cus_from_client" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://billing.stripe.test/bps_test" });
    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: "cus_stored",
      return_url: "http://127.0.0.1:8787/settings",
    });
  });
});
