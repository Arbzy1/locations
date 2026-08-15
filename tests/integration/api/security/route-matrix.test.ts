import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestApp, sessionUser } from "@tests/helpers/api-app";
import { testEnv } from "@tests/helpers/env";
import { API_ROUTE_CATALOG } from "@tests/helpers/api-route-catalog";

const getSession = vi.fn();
const constructEventAsync = vi.fn();
const createCheckout = vi.fn(async () => ({ url: "https://checkout.stripe.com/c/test" }));
const createPortal = vi.fn(async () => ({ url: "https://billing.stripe.com/p/test" }));

vi.mock("@locations/api/auth", () => ({
  createAuth: () => ({
    handler: async () => new Response("auth"),
    api: { getSession: (...args: unknown[]) => getSession(...args) },
  }),
}));

vi.mock("@locations/api/services", async () => {
  const { createServicesMock: factory } = await import("@tests/helpers/api-app");
  return factory();
});

vi.mock("@locations/api/billing", () => ({
  stripeClient: (env: { STRIPE_SECRET_KEY?: string }) =>
    env.STRIPE_SECRET_KEY
      ? {
          webhooks: { constructEventAsync },
          checkout: { sessions: { create: createCheckout } },
          billingPortal: { sessions: { create: createPortal } },
          customers: { del: vi.fn(async () => undefined) },
        }
      : null,
  priceIdForInterval: () => "price_monthly",
  recordStripeEvent: vi.fn(async () => true),
  syncSubscriptionFromStripe: vi.fn(),
  tenantForStripeCustomer: vi.fn(),
}));

import { app } from "@locations/api/index";
import { resetRateLimits } from "@locations/api/rate-limit";
import {
  deleteChapter,
  deleteNamedTrip,
  getActiveImportJob,
  getDay,
  patchSource,
  resolveCoords,
  staffTenantStats,
  upsertChapter,
  upsertNamedTrip,
  upsertPlaceLabel,
  upsertUserSettings,
  wipeTenantData,
} from "@locations/api/services";

const env = testEnv();
const billingEnv = testEnv({
  STRIPE_SECRET_KEY: "sk_test",
  STRIPE_WEBHOOK_SECRET: "whsec_test",
  STRIPE_PRICE_MONTHLY: "price_monthly",
  STRIPE_PRICE_YEARLY: "price_yearly",
  BETTER_AUTH_URL: "https://locations.aden.website",
});

function request(path: string, init?: RequestInit, requestEnv = env) {
  return requestApp(app, path, init, requestEnv);
}

const sessionRoutes = API_ROUTE_CATALOG.filter((r) => r.auth === "session");
const denyWrite = API_ROUTE_CATALOG.filter((r) => r.demo === "denyWrite");
const missingRow = API_ROUTE_CATALOG.filter((r) => r.idScope === "tenantRow" || r.idScope === "job");

describe("API threat matrix", () => {
  beforeEach(() => {
    getSession.mockReset();
    constructEventAsync.mockReset();
    createCheckout.mockClear();
    createPortal.mockClear();
    resetRateLimits();
    vi.mocked(getDay).mockResolvedValue({ error: "No data for this date" });
    vi.mocked(getActiveImportJob).mockResolvedValue(null);
    vi.mocked(upsertNamedTrip).mockResolvedValue({ error: "Not found" });
    vi.mocked(deleteNamedTrip).mockResolvedValue({ error: "Not found" });
    vi.mocked(upsertChapter).mockResolvedValue({ error: "Not found" });
    vi.mocked(deleteChapter).mockResolvedValue({ error: "Not found" });
    vi.mocked(patchSource).mockResolvedValue({ error: "Source not found" });
    vi.mocked(resolveCoords).mockResolvedValue({ name: "Unknown", address: "" });
    vi.mocked(wipeTenantData).mockReset();
    vi.mocked(upsertUserSettings).mockResolvedValue({ distanceUnit: "km" } as never);
    vi.mocked(upsertPlaceLabel).mockResolvedValue({ placeKey: "home", label: "ok" } as never);
    vi.mocked(staffTenantStats).mockClear();
  });

  it("returns 401 and Cache-Control no-store for every session route", async () => {
    getSession.mockResolvedValue(null);
    for (const route of sessionRoutes) {
      const res = await request(route.samplePath, { method: methodOf(route.method) });
      expect(res.status, `${route.method} ${route.path}`).toBe(401);
      expect(res.headers.get("Cache-Control"), `${route.path} cache`).toBe("no-store, private");
    }
  });

  it("returns 404 not 403 when a tenant-scoped row is missing", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a", emailVerified: true }));
    for (const route of missingRow) {
      const res = await request(route.samplePath, {
        method: methodOf(route.method),
        headers: { "Content-Type": "application/json" },
        body: mutateBody(route.method),
      });
      expect(res.status, `${route.method} ${route.path}`).toBe(404);
      expect(res.status).not.toBe(403);
    }
  });

  it("blocks demo writes with 403", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "demo-1", role: "demo", emailVerified: true }));
    for (const route of denyWrite) {
      const res = await request(route.samplePath, {
        method: methodOf(route.method),
        headers: { "Content-Type": "application/json" },
        body: mutateBody(route.method),
      });
      expect(res.status, `${route.method} ${route.path}`).toBe(403);
    }
  });

  it("hides staff stats from normal users and keeps admin on their tenant", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a", role: "user" }));
    const denied = await request("/api/admin/stats");
    expect(denied.status).toBe(404);
    expect(staffTenantStats).not.toHaveBeenCalled();

    getSession.mockResolvedValue(sessionUser({ id: "user-a", role: "admin" }));
    const admin = await request("/api/admin/stats");
    expect(admin.status).toBe(200);
    expect(staffTenantStats).toHaveBeenCalledWith(expect.anything(), "user-a");

    getSession.mockResolvedValue(sessionUser({ id: "user-a", role: "developer" }));
    const dev = await request("/api/admin/stats");
    expect(dev.status).toBe(200);
  });

  it("accepts webhooks without a session and rejects bad signatures with 400", async () => {
    getSession.mockResolvedValue(null);
    const missing = await request("/api/billing/webhook", { method: "POST", body: "{}" }, billingEnv);
    expect(missing.status).toBe(400);
    expect(missing.status).not.toBe(401);

    constructEventAsync.mockRejectedValue(new Error("bad sig"));
    const invalid = await request(
      "/api/billing/webhook",
      { method: "POST", headers: { "stripe-signature": "t=1,v1=x" }, body: "{}" },
      billingEnv,
    );
    expect(invalid.status).toBe(400);
    expect(invalid.status).not.toBe(401);
  });

  it("rate-limits auth, demo, search, place, and checkout", async () => {
    getSession.mockResolvedValue(null);
    let lastAuth = 200;
    for (let i = 0; i < 31; i++) {
      lastAuth = (await request("/api/auth/sign-in/email", { method: "POST" })).status;
    }
    expect(lastAuth).toBe(429);

    let lastDemo = 200;
    for (let i = 0; i < 11; i++) {
      lastDemo = (await request("/api/auth/demo", { method: "POST" })).status;
    }
    expect(lastDemo).toBe(429);

    getSession.mockResolvedValue(sessionUser({ id: "user-a", emailVerified: true }));
    let lastSearch = 200;
    for (let i = 0; i < 61; i++) {
      lastSearch = (await request("/api/search?q=park")).status;
    }
    expect(lastSearch).toBe(429);

    let lastPlace = 200;
    for (let i = 0; i < 31; i++) {
      lastPlace = (await request("/api/place/probe?lat=51.5&lon=-0.1")).status;
    }
    expect(lastPlace).toBe(429);

    let lastCheckout = 200;
    for (let i = 0; i < 11; i++) {
      lastCheckout = (
        await request(
          "/api/billing/checkout",
          { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
          billingEnv,
        )
      ).status;
    }
    expect(lastCheckout).toBe(429);

    resetRateLimits();
    let lastPortal = 200;
    for (let i = 0; i < 11; i++) {
      lastPortal = (await request("/api/billing/portal", { method: "POST" }, billingEnv)).status;
    }
    expect(lastPortal).toBe(429);
  });

  it("does not mass-assign role, tenant, priceId, or customerId", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a", emailVerified: true }));
    const poison = {
      label: "ok",
      placeKey: "home",
      role: "admin",
      tenant: "other-tenant-id",
      priceId: "price_evil",
      customerId: "cus_evil",
      distanceUnit: "km",
    };
    await request("/api/sources/src-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(poison),
    });
    expect(patchSource).toHaveBeenCalled();
    const sourcePatch = vi.mocked(patchSource).mock.calls[0]?.[3] as Record<string, unknown>;
    expect(sourcePatch).not.toHaveProperty("role");
    expect(sourcePatch).not.toHaveProperty("tenant");
    expect(sourcePatch).not.toHaveProperty("priceId");
    expect(sourcePatch).not.toHaveProperty("customerId");

    await request("/api/account/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(poison),
    });
    const settings = vi.mocked(upsertUserSettings).mock.calls[0]?.[2] as Record<string, unknown>;
    expect(settings).not.toHaveProperty("role");
    expect(settings).not.toHaveProperty("tenant");
    expect(settings).not.toHaveProperty("priceId");
    expect(settings).not.toHaveProperty("customerId");

    await request("/api/places/labels", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(poison),
    });
    const label = vi.mocked(upsertPlaceLabel).mock.calls[0]?.[2] as Record<string, unknown>;
    expect(label).not.toHaveProperty("role");
    expect(label).not.toHaveProperty("tenant");
    expect(label).not.toHaveProperty("priceId");
    expect(label).not.toHaveProperty("customerId");
  });

  it("keeps Stripe success and cancel URLs on BETTER_AUTH_URL", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a", emailVerified: true }));
    const res = await request(
      "/api/billing/checkout",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ interval: "monthly" }) },
      billingEnv,
    );
    expect(res.status).toBe(200);
    const args = createCheckout.mock.calls[0]?.[0] as { success_url: string; cancel_url: string };
    expect(args.success_url.startsWith("https://locations.aden.website/")).toBe(true);
    expect(args.cancel_url.startsWith("https://locations.aden.website/")).toBe(true);
  });

  it("clamps reverse-geocode coordinates and ignores non-numeric input", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    vi.mocked(resolveCoords).mockClear();
    const bad = await request("/api/place/probe?lat=abc&lon=9999");
    expect(bad.status).toBe(200);
    expect(resolveCoords).not.toHaveBeenCalled();

    const huge = await request("/api/place/probe?lat=999&lon=-0.1");
    expect(huge.status).toBe(200);
    expect(resolveCoords).not.toHaveBeenCalled();

    const ok = await request("/api/place/probe?lat=51.507351&lon=-0.127758");
    expect(ok.status).toBe(200);
    expect(resolveCoords).toHaveBeenCalledWith(expect.anything(), 51.50735, -0.12776);
  });

  it("returns 409 when an import is already running and 400 for mbox", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a", emailVerified: true }));
    vi.mocked(getActiveImportJob).mockResolvedValue({ id: "job-open", status: "processing" } as never);
    const busy = await request("/api/import", { method: "POST", body: new FormData() });
    expect(busy.status).toBe(409);

    vi.mocked(getActiveImportJob).mockResolvedValue(null);
    const form = new FormData();
    form.append("file", new File(["From: x"], "mail.mbox", { type: "application/mbox" }));
    const mbox = await request("/api/import", { method: "POST", body: form });
    expect(mbox.status).toBe(400);
  });

  it("wipes the session tenant on account delete", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a", email: "a@example.com" }));
    vi.mocked(env.UPLOADS.list).mockResolvedValue({ objects: [], truncated: false } as never);
    const res = await request("/api/account/delete", { method: "POST" });
    expect(res.status).toBe(200);
    expect(wipeTenantData).toHaveBeenCalledWith(expect.anything(), "user-a", "user-a", "a@example.com");
  });

  it("sets baseline API headers and does not reflect an evil Origin", async () => {
    getSession.mockResolvedValue(null);
    const res = await request("/api/overview", {
      headers: { Origin: "https://evil.example" },
    });
    expect(res.status).toBe(401);
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Access-Control-Allow-Origin")).not.toBe("https://evil.example");
  });
});

function methodOf(method: string): string {
  return method === "ALL" ? "GET" : method;
}

function mutateBody(method: string): string | undefined {
  if (method === "GET" || method === "DELETE") return undefined;
  return JSON.stringify({ label: "x", name: "x", start: "2024-01-01", end: "2024-01-02" });
}
