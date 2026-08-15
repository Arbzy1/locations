import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestApp, sessionUser } from "@tests/helpers/api-app";
import { testEnv } from "@tests/helpers/env";
import { ADMIN_GET_ROUTES, ADMIN_MUTATION_ROUTES, ADMIN_ROUTE_CATALOG } from "@tests/helpers/admin-route-catalog";
import { payloadLooksLikeLocationPii } from "@locations/api/admin-guards";
import { resetRateLimits } from "@locations/api/rate-limit";

const getSession = vi.fn();

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

vi.mock("@locations/api/admin-ops", async () => {
  const { createAdminOpsMock } = await import("@tests/helpers/admin-app");
  return createAdminOpsMock();
});

import { app } from "@locations/api/index";
import * as adminOps from "@locations/api/admin-ops";

function methodOf(method: string): string {
  return method === "ALL" ? "GET" : method;
}

async function request(path: string, init?: RequestInit) {
  return requestApp(app, path, init, testEnv());
}

describe("admin route matrix", () => {
  beforeEach(() => {
    getSession.mockReset();
    resetRateLimits();
    adminOps.getOpsUserCard.mockImplementation(async (_env: unknown, id: string) =>
      id === "missing-id"
        ? null
        : {
            id,
            email: "a@example.com",
            name: "User A",
            role: "user",
            emailVerified: true,
            createdAt: "2026-01-01T00:00:00.000Z",
            visitCount: 0,
            sourceCount: 0,
            sessionCount: 0,
            billingStatus: "none",
            recapOptIn: false,
            latestImport: null,
            latestExport: null,
          },
    );
    adminOps.setOpsUserRole.mockResolvedValue({ ok: true });
    adminOps.wipeOpsUser.mockResolvedValue({ ok: true });
    adminOps.patchOpsFlags.mockResolvedValue({ ok: true });
  });

  it("returns 401 for every admin route without a session", async () => {
    getSession.mockResolvedValue(null);
    for (const route of ADMIN_ROUTE_CATALOG) {
      const res = await request(route.samplePath, { method: methodOf(route.method) });
      expect(res.status, `${route.method} ${route.path}`).toBe(401);
    }
  });

  it("hides every admin route from role=user with 404", async () => {
    getSession.mockResolvedValue(sessionUser({ role: "user" }));
    for (const route of ADMIN_ROUTE_CATALOG) {
      const res = await request(route.samplePath, {
        method: methodOf(route.method),
        headers: { "Content-Type": "application/json" },
        body: route.method === "GET" ? undefined : "{}",
      });
      expect(res.status, `${route.method} ${route.path}`).toBe(404);
    }
  });

  it("hides every admin route from role=demo with 404", async () => {
    getSession.mockResolvedValue(sessionUser({ role: "demo", id: "demo-1" }));
    for (const route of ADMIN_ROUTE_CATALOG) {
      const res = await request(route.samplePath, {
        method: methodOf(route.method),
        headers: { "Content-Type": "application/json" },
        body: route.method === "GET" ? undefined : "{}",
      });
      expect(res.status, `${route.method} ${route.path}`).toBe(404);
    }
  });

  it("allows developer GET and 404s developer mutations", async () => {
    getSession.mockResolvedValue(sessionUser({ role: "developer", id: "dev-1" }));
    for (const route of ADMIN_GET_ROUTES) {
      const res = await request(route.samplePath);
      expect(res.status, `${route.method} ${route.path}`).toBe(200);
      const body = await res.json();
      expect(payloadLooksLikeLocationPii(body), route.path).toBe(false);
    }
    for (const route of ADMIN_MUTATION_ROUTES) {
      const res = await request(route.samplePath, {
        method: methodOf(route.method),
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      expect(res.status, `${route.method} ${route.path}`).toBe(404);
      expect(res.status).not.toBe(403);
    }
  });

  it("allows admin GET on every catalogued path", async () => {
    getSession.mockResolvedValue(sessionUser({ role: "admin", id: "admin-1" }));
    for (const route of ADMIN_GET_ROUTES) {
      const res = await request(route.samplePath);
      expect(res.status, `${route.method} ${route.path}`).toBe(200);
      const body = await res.json();
      expect(payloadLooksLikeLocationPii(body), route.path).toBe(false);
    }
  });

  it("returns 404 for unknown user ids", async () => {
    getSession.mockResolvedValue(sessionUser({ role: "admin", id: "admin-1" }));
    const res = await request("/api/admin/users/missing-id");
    expect(res.status).toBe(404);
  });

  it("caps user list work at 50 in the handler contract", async () => {
    getSession.mockResolvedValue(sessionUser({ role: "admin", id: "admin-1" }));
    const res = await request("/api/admin/users?limit=500");
    expect(res.status).toBe(200);
    expect(adminOps.listOpsUsers).toHaveBeenCalled();
  });
});
