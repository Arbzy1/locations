import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestApp, sessionUser } from "@tests/helpers/api-app";
import { testEnv } from "@tests/helpers/env";
import type { Env } from "@locations/api/env";

const getSession = vi.fn();
const { stripe } = vi.hoisted(() => ({
  stripe: {
    customers: { del: vi.fn(async () => ({ deleted: true, id: "cus_1" })) },
  },
}));

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

vi.mock("@locations/api/billing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@locations/api/billing")>();
  return {
    ...actual,
    stripeClient: (env: Env) => (env.STRIPE_SECRET_KEY ? stripe : null),
  };
});

import { app } from "@locations/api/index";
import { getSubscription, wipeTenantData } from "@locations/api/services";

const env = testEnv();

function request(path: string, init?: RequestInit, requestEnv: Env = env) {
  return requestApp(app, path, init, requestEnv);
}

describe("POST /api/account/delete", () => {
  beforeEach(() => {
    getSession.mockReset();
    stripe.customers.del.mockReset();
    stripe.customers.del.mockResolvedValue({ deleted: true, id: "cus_1" });
    vi.mocked(wipeTenantData).mockReset();
    vi.mocked(getSubscription).mockReset();
    vi.mocked(getSubscription).mockResolvedValue(null);
    vi.mocked(env.UPLOADS.list).mockReset();
    vi.mocked(env.UPLOADS.delete).mockReset();
    vi.mocked(env.UPLOADS.list).mockResolvedValue({ objects: [], truncated: false } as never);
  });

  it("rejects unauthenticated access", async () => {
    getSession.mockResolvedValue(null);
    const res = await request("/api/account/delete", { method: "POST" });
    expect(res.status).toBe(401);
    expect(wipeTenantData).not.toHaveBeenCalled();
  });

  it("blocks demo users", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "demo-1", role: "demo" }));
    const res = await request("/api/account/delete", { method: "POST" });
    expect(res.status).toBe(403);
    expect(wipeTenantData).not.toHaveBeenCalled();
    expect(stripe.customers.del).not.toHaveBeenCalled();
  });

  it("wipes the session tenant and pages R2 prefixes", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a", email: "a@example.com" }));
    vi.mocked(env.UPLOADS.list)
      .mockResolvedValueOnce({
        objects: [{ key: "uploads/user-a/1.json" }],
        truncated: true,
        cursor: "next",
      } as never)
      .mockResolvedValueOnce({
        objects: [{ key: "uploads/user-a/2.json" }],
        truncated: false,
      } as never)
      .mockResolvedValue({ objects: [], truncated: false } as never);
    const res = await request("/api/account/delete", { method: "POST" });
    expect(res.status).toBe(200);
    expect(wipeTenantData).toHaveBeenCalledWith(expect.anything(), "user-a", "user-a", "a@example.com");
    expect(env.UPLOADS.delete).toHaveBeenCalledWith("uploads/user-a/1.json");
    expect(env.UPLOADS.delete).toHaveBeenCalledWith("uploads/user-a/2.json");
    expect(env.UPLOADS.list).toHaveBeenCalled();
    expect(stripe.customers.del).not.toHaveBeenCalled();
  });

  it("deletes the Stripe customer when billing is configured", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a", email: "a@example.com" }));
    vi.mocked(getSubscription).mockResolvedValue({
      stripeCustomerId: "cus_1",
    } as never);
    const billed = testEnv({ STRIPE_SECRET_KEY: "sk_test" });
    vi.mocked(billed.UPLOADS.list).mockResolvedValue({ objects: [], truncated: false } as never);
    const res = await request("/api/account/delete", { method: "POST" }, billed);
    expect(res.status).toBe(200);
    expect(stripe.customers.del).toHaveBeenCalledWith("cus_1");
    expect(wipeTenantData).toHaveBeenCalled();
  });

  it("still wipes the tenant when Stripe customer delete fails", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a", email: "a@example.com" }));
    vi.mocked(getSubscription).mockResolvedValue({
      stripeCustomerId: "cus_1",
    } as never);
    stripe.customers.del.mockRejectedValue(new Error("stripe down"));
    const billed = testEnv({ STRIPE_SECRET_KEY: "sk_test" });
    vi.mocked(billed.UPLOADS.list).mockResolvedValue({ objects: [], truncated: false } as never);
    const res = await request("/api/account/delete", { method: "POST" }, billed);
    expect(res.status).toBe(200);
    expect(wipeTenantData).toHaveBeenCalled();
  });
});
