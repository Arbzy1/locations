import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestApp, sessionUser } from "@tests/helpers/api-app";
import { testEnv } from "@tests/helpers/env";
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

async function request(path: string, init?: RequestInit) {
  return requestApp(app, path, init, testEnv());
}

describe("admin user mutations", () => {
  beforeEach(() => {
    getSession.mockReset();
    resetRateLimits();
    adminOps.setOpsUserRole.mockReset();
    adminOps.wipeOpsUser.mockReset();
    adminOps.revokeOpsUserSessions.mockReset();
    adminOps.verifyOpsUser.mockReset();
  });

  it("rejects role=demo and last-admin demote", async () => {
    getSession.mockResolvedValue(sessionUser({ role: "admin", id: "admin-1" }));
    adminOps.setOpsUserRole.mockResolvedValueOnce({ error: "Invalid role", status: 400 as const });
    const demo = await request("/api/admin/users/u2/role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "demo" }),
    });
    expect(demo.status).toBe(400);

    adminOps.setOpsUserRole.mockResolvedValueOnce({
      error: "Cannot demote the last admin",
      status: 400 as const,
    });
    const last = await request("/api/admin/users/admin-1/role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "user" }),
    });
    expect(last.status).toBe(400);
  });

  it("rejects wipe without matching email and wipes when confirmed", async () => {
    getSession.mockResolvedValue(sessionUser({ role: "admin", id: "admin-1" }));
    adminOps.wipeOpsUser.mockResolvedValueOnce({
      error: "Email confirmation does not match",
      status: 400 as const,
    });
    const bad = await request("/api/admin/users/u2/wipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "wrong@example.com" }),
    });
    expect(bad.status).toBe(400);

    adminOps.wipeOpsUser.mockResolvedValueOnce({ ok: true as const });
    const ok = await request("/api/admin/users/u2/wipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "u2@example.com" }),
    });
    expect(ok.status).toBe(200);
    expect(adminOps.wipeOpsUser).toHaveBeenCalled();
  });

  it("rate-limits admin mutations", async () => {
    getSession.mockResolvedValue(sessionUser({ role: "admin", id: "admin-1" }));
    adminOps.verifyOpsUser.mockResolvedValue({ ok: true as const });
    let last = 200;
    for (let i = 0; i < 21; i++) {
      last = (
        await request("/api/admin/users/u2/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emailVerified: true }),
        })
      ).status;
    }
    expect(last).toBe(429);
  });
});
