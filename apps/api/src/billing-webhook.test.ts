import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "./env";

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

vi.mock("./auth", () => ({
  createAuth: () => ({
    handler: async () => new Response("auth"),
    api: { getSession: async () => null },
  }),
}));

vi.mock("./services", () => ({
  getDb: vi.fn(() => ({})),
  configureGeoEndpoints: vi.fn(),
  getOverview: vi.fn(),
  getDays: vi.fn(),
  getDay: vi.fn(),
  getHeatmap: vi.fn(),
  getAnalytics: vi.fn(),
  getRouteProgress: vi.fn(),
  resolveCoords: vi.fn(),
  listSources: vi.fn(),
  getSourceById: vi.fn(),
  renameSource: vi.fn(),
  removeSource: vi.fn(),
  getImportStatus: vi.fn(),
  createImportJob: vi.fn(),
  ensureDataSource: vi.fn(),
  importSourceData: vi.fn(),
  updateImportJob: vi.fn(),
  getImportJob: vi.fn(),
  emailForTenant: vi.fn(async () => ({ email: "a@example.com", role: "user" })),
  getSubscription: vi.fn(),
  getUserSettings: vi.fn(),
  searchTenant: vi.fn(),
  upsertUserSettings: vi.fn(),
  upsertPlaceLabel: vi.fn(),
  listPlaceLabels: vi.fn(),
  wipeTenantData: vi.fn(),
}));

vi.mock("./billing", () => ({
  stripeClient: () => ({
    webhooks: { constructEventAsync },
    subscriptions: { retrieve: retrieveSubscription },
  }),
  priceIdForInterval: () => "price_x",
  recordStripeEvent,
  syncSubscriptionFromStripe,
  tenantForStripeCustomer,
}));

import { app } from "./index";

const env = {
  DATABASE_URL: "postgres://test",
  BETTER_AUTH_SECRET: "test-secret-at-least-32-chars-long!!",
  BETTER_AUTH_URL: "http://127.0.0.1:8787",
  STRIPE_SECRET_KEY: "sk_test",
  STRIPE_WEBHOOK_SECRET: "whsec_test",
  ASSETS: { fetch: async () => new Response("asset") },
  UPLOADS: { put: vi.fn(), get: vi.fn() },
} as unknown as Env;

const executionCtx = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
  props: {},
} as unknown as ExecutionContext;

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
