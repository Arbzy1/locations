import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@locations/api/env";
import { requestApp, sessionUser } from "@tests/helpers/api-app";
import { testEnv } from "@tests/helpers/env";

const getSession = vi.fn();

vi.mock("@locations/api/auth", () => ({
  createAuth: () => ({
    handler: async () => new Response("auth"),
    api: {
      getSession: (...args: unknown[]) => getSession(...args),
    },
  }),
}));

vi.mock("@locations/api/services", async () => {
  const { createServicesMock: factory } = await import("@tests/helpers/api-app");
  return factory();
});

import { app } from "@locations/api/index";
import {
  getOverview,
  getSourceById,
  listPlaceLabels,
  patchSource,
  removeSource,
  upsertPlaceLabel,
  listClusters,
  getCluster,
  getCorridorDetail,
  listClusterVisits,
  upsertNamedTrip,
  upsertChapter,
  listImportJobs,
  staffTenantStats,
} from "@locations/api/services";

const env = testEnv();

async function request(path: string, init?: RequestInit, requestEnv: Env = env) {
  return requestApp(app, path, init, requestEnv);
}

describe("API auth boundaries", () => {
  beforeEach(() => {
    getSession.mockReset();
    vi.mocked(getOverview).mockClear();
    vi.mocked(getSourceById).mockReset();
    vi.mocked(patchSource).mockReset();
    vi.mocked(removeSource).mockReset();
    vi.mocked(getOverview).mockResolvedValue({ ok: true } as never);
    vi.mocked(patchSource).mockResolvedValue({ error: "Source not found" });
    vi.mocked(removeSource).mockResolvedValue({ error: "Source not found" });
    vi.mocked(getSourceById).mockResolvedValue(null);
    vi.mocked(upsertPlaceLabel).mockReset();
  });

  it("allows unauthenticated access to /api/health", async () => {
    getSession.mockResolvedValue(null);
    const res = await request("/api/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.worker).toBe("ok");
    expect(body.db).toBe("ok");
    expect(getSession).not.toHaveBeenCalled();
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Content-Security-Policy-Report-Only")).toContain(
      "frame-ancestors",
    );
  });

  it("rejects unauthenticated access to /api/overview", async () => {
    getSession.mockResolvedValue(null);
    const res = await request("/api/overview");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(res.headers.get("Cache-Control")).toBe("no-store, private");
  });

  it("does not reflect arbitrary CORS origins", async () => {
    getSession.mockResolvedValue(null);
    const res = await request("/api/health", {
      headers: { Origin: "https://evil.example" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).not.toBe(
      "https://evil.example",
    );
  });

  it("allows listed CORS origins", async () => {
    getSession.mockResolvedValue(null);
    const res = await request("/api/health", {
      headers: { Origin: "http://127.0.0.1:5173" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://127.0.0.1:5173",
    );
  });

  it("passes session tenant into overview (no client tenant)", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    await request("/api/overview");
    expect(getOverview).toHaveBeenCalledWith(expect.anything(), "user-a");
  });

  it("rejects unauthenticated access to /api/sources", async () => {
    getSession.mockResolvedValue(null);
    const res = await request("/api/sources");
    expect(res.status).toBe(401);
  });

  it("blocks demo users from PATCH /api/sources/:id", async () => {
    getSession.mockResolvedValue(sessionUser({ role: "demo", id: "demo-1" }));
    const res = await request("/api/sources/src-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Nope" }),
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "Demo accounts cannot import or manage data sources",
    });
    expect(patchSource).not.toHaveBeenCalled();
  });

  it("blocks demo users from DELETE /api/sources/:id", async () => {
    getSession.mockResolvedValue(sessionUser({ role: "demo", id: "demo-1" }));
    const res = await request("/api/sources/src-1", { method: "DELETE" });
    expect(res.status).toBe(403);
    expect(removeSource).not.toHaveBeenCalled();
  });

  it("blocks demo users from POST /api/import", async () => {
    getSession.mockResolvedValue(sessionUser({ role: "demo", id: "demo-1" }));
    const res = await request("/api/import", { method: "POST" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "Demo accounts cannot import or manage data sources",
    });
  });

  it("denies cross-tenant source rename (source not found for caller tenant)", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    vi.mocked(patchSource).mockResolvedValue({ error: "Source not found" });

    const res = await request("/api/sources/other-tenant-source", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Stolen" }),
    });

    expect(res.status).toBe(404);
    expect(patchSource).toHaveBeenCalledWith(
      expect.anything(),
      "user-a",
      "other-tenant-source",
      expect.objectContaining({ label: "Stolen" }),
    );
  });

  it("denies cross-tenant source delete", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    vi.mocked(removeSource).mockResolvedValue({ error: "Source not found" });

    const res = await request("/api/sources/other-tenant-source", {
      method: "DELETE",
    });

    expect(res.status).toBe(404);
    expect(removeSource).toHaveBeenCalledWith(
      expect.anything(),
      "user-a",
      "other-tenant-source",
    );
  });

  it("returns 402 for a paying-gated user import when Stripe is configured", async () => {
    getSession.mockResolvedValue(
      sessionUser({ id: "user-pay", emailVerified: true, role: "user" }),
    );
    const stripeEnv = { ...env, STRIPE_SECRET_KEY: "sk_test_x" };
    const res = await request("/api/import", { method: "POST" }, stripeEnv);
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({
      error: "An active subscription is required to import",
    });
  });

  it("skips the Stripe import gate for admin", async () => {
    getSession.mockResolvedValue(
      sessionUser({ id: "user-admin", emailVerified: true, role: "admin" }),
    );
    const stripeEnv = { ...env, STRIPE_SECRET_KEY: "sk_test_x" };
    const res = await request("/api/import", { method: "POST" }, stripeEnv);
    expect(res.status).not.toBe(402);
    expect(res.status).toBe(400);
  });

  it("skips the Stripe import gate for developer", async () => {
    getSession.mockResolvedValue(
      sessionUser({
        id: "user-dev",
        emailVerified: true,
        role: "developer",
      }),
    );
    const stripeEnv = { ...env, STRIPE_SECRET_KEY: "sk_test_x" };
    const res = await request("/api/import", { method: "POST" }, stripeEnv);
    expect(res.status).not.toBe(402);
    expect(res.status).toBe(400);
  });

  it("marks staff entitled on /api/me without a subscription", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-admin", role: "admin" }));
    const res = await request("/api/me");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { entitlements: { entitled: boolean } };
    expect(body.entitlements.entitled).toBe(true);
  });

  it("rejects unauthenticated access to /api/account/export", async () => {
    getSession.mockResolvedValue(null);
    const res = await request("/api/account/export");
    expect(res.status).toBe(401);
  });

  it("allows the owner to export account JSON", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    const res = await request("/api/account/export");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toMatch(/locations-export-.*\.json/);
    const body = (await res.json()) as { tenant: string };
    expect(body.tenant).toBe("user-a");
  });

  it("rejects unauthenticated access to /api/places/labels", async () => {
    getSession.mockResolvedValue(null);
    const res = await request("/api/places/labels");
    expect(res.status).toBe(401);
  });

  it("allows the owner to list place labels", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    vi.mocked(listPlaceLabels).mockResolvedValueOnce([] as never);
    const res = await request("/api/places/labels");
    expect(res.status).toBe(200);
    expect(listPlaceLabels).toHaveBeenCalledWith(expect.anything(), "user-a");
  });

  it("allows demo users to list place labels", async () => {
    getSession.mockResolvedValue(sessionUser({ role: "demo", id: "demo-1" }));
    vi.mocked(listPlaceLabels).mockResolvedValueOnce([] as never);
    const res = await request("/api/places/labels");
    expect(res.status).toBe(200);
  });

  it("rejects unauthenticated PATCH /api/places/labels", async () => {
    getSession.mockResolvedValue(null);
    const res = await request("/api/places/labels", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ placeKey: "Home", favourite: true }),
    });
    expect(res.status).toBe(401);
    expect(upsertPlaceLabel).not.toHaveBeenCalled();
  });

  it("blocks demo users from PATCH /api/places/labels", async () => {
    getSession.mockResolvedValue(sessionUser({ role: "demo", id: "demo-1" }));
    const res = await request("/api/places/labels", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ placeKey: "Home", favourite: true }),
    });
    expect(res.status).toBe(403);
    expect(upsertPlaceLabel).not.toHaveBeenCalled();
  });

  it("allows the owner to patch a favourite without renaming", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    vi.mocked(upsertPlaceLabel).mockResolvedValueOnce({
      placeKey: "Home",
      label: "Home",
      hidden: false,
      favourite: true,
      color: null,
      tags: [],
    } as never);
    const res = await request("/api/places/labels", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ placeKey: "Home", favourite: true }),
    });
    expect(res.status).toBe(200);
    expect(upsertPlaceLabel).toHaveBeenCalledWith(
      expect.anything(),
      "user-a",
      expect.objectContaining({ placeKey: "Home", favourite: true }),
    );
  });

  it("rejects an unknown place colour", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    const res = await request("/api/places/labels", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ placeKey: "Home", color: "#ff00aa" }),
    });
    expect(res.status).toBe(400);
    expect(upsertPlaceLabel).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated access to /api/clusters", async () => {
    getSession.mockResolvedValue(null);
    const res = await request("/api/clusters");
    expect(res.status).toBe(401);
  });

  it("allows the owner to list clusters", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    vi.mocked(listClusters).mockResolvedValueOnce({ clusters: [], cursor: null } as never);
    const res = await request("/api/clusters");
    expect(res.status).toBe(200);
    expect(listClusters).toHaveBeenCalledWith(expect.anything(), "user-a", expect.any(Object));
  });

  it("returns 404 for a missing cluster", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    vi.mocked(getCluster).mockResolvedValueOnce(null);
    const res = await request("/api/clusters/missing");
    expect(res.status).toBe(404);
  });

  it("blocks demo users from creating named trips", async () => {
    getSession.mockResolvedValue(sessionUser({ role: "demo", id: "demo-1" }));
    const res = await request("/api/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Holiday", start: "2024-01-01", end: "2024-01-03" }),
    });
    expect(res.status).toBe(403);
    expect(upsertNamedTrip).not.toHaveBeenCalled();
  });

  it("returns 404 for staff stats when the user is not staff", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a", role: "user" }));
    const res = await request("/api/admin/stats");
    expect(res.status).toBe(404);
    expect(staffTenantStats).not.toHaveBeenCalled();
  });

  it("allows staff to read own-tenant admin stats", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a", role: "admin" }));
    vi.mocked(staffTenantStats).mockResolvedValueOnce({
      visitCount: 3,
      sourceCount: 1,
      latestJobStatus: "ready",
      recentJobCount: 1,
    } as never);
    const res = await request("/api/admin/stats");
    expect(res.status).toBe(200);
  });

  it("returns 404 for a missing corridor", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    vi.mocked(getCorridorDetail).mockResolvedValueOnce(null);
    const res = await request("/api/corridors/Home/Work");
    expect(res.status).toBe(404);
  });

  it("allows the owner to list cluster visits", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    vi.mocked(listClusterVisits).mockResolvedValueOnce({ visits: [], cursor: null } as never);
    const res = await request("/api/clusters/Home/visits");
    expect(res.status).toBe(200);
    expect(listClusterVisits).toHaveBeenCalled();
  });

  it("blocks demo users from creating life chapters", async () => {
    getSession.mockResolvedValue(sessionUser({ role: "demo", id: "demo-1" }));
    const res = await request("/api/chapters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Uni", start: "2020-01-01", end: "2023-01-01" }),
    });
    expect(res.status).toBe(403);
    expect(upsertChapter).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated access to import jobs", async () => {
    getSession.mockResolvedValue(null);
    const res = await request("/api/import/jobs");
    expect(res.status).toBe(401);
    expect(listImportJobs).not.toHaveBeenCalled();
  });
});
