import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestApp, sessionUser } from "@tests/helpers/api-app";
import { testEnv } from "@tests/helpers/env";
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

async function request(path: string, init?: RequestInit) {
  return requestApp(app, path, init, testEnv());
}

describe("admin operator abilities", () => {
  beforeEach(() => {
    getSession.mockReset();
    resetRateLimits();
    adminOps.inviteOpsUser.mockReset();
    adminOps.failOpsImportJob.mockReset();
    adminOps.failOpsExportJob.mockReset();
    adminOps.resetOpsFlag.mockReset();
    adminOps.sendOpsEmailTest.mockReset();
    adminOps.getOpsMapsProbe.mockClear();
  });

  it("rejects invite of admin or demo and duplicate email, and never returns a password", async () => {
    getSession.mockResolvedValue(sessionUser({ role: "admin", id: "admin-1" }));
    adminOps.inviteOpsUser.mockResolvedValueOnce({
      error: "Invite role must be user or developer",
      status: 400 as const,
    });
    const adminRole = await request("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "new@example.com", role: "admin" }),
    });
    expect(adminRole.status).toBe(400);

    adminOps.inviteOpsUser.mockResolvedValueOnce({
      error: "Invite role must be user or developer",
      status: 400 as const,
    });
    const demoRole = await request("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "new@example.com", role: "demo" }),
    });
    expect(demoRole.status).toBe(400);

    adminOps.inviteOpsUser.mockResolvedValueOnce({
      error: "Email already in use",
      status: 400 as const,
    });
    const dup = await request("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a@example.com", role: "user" }),
    });
    expect(dup.status).toBe(400);

    adminOps.inviteOpsUser.mockResolvedValueOnce({ ok: true as const, id: "invited-1", reset: "skipped" as const });
    const ok = await request("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "new@example.com", role: "user" }),
    });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as Record<string, unknown>;
    expect(body.password).toBeUndefined();
    expect(JSON.stringify(body)).not.toMatch(/password/i);
  });

  it("returns 404 for unknown stuck import jobs and unlocks when found", async () => {
    getSession.mockResolvedValue(sessionUser({ role: "admin", id: "admin-1" }));
    adminOps.failOpsImportJob.mockResolvedValueOnce({ error: "Not found", status: 404 as const });
    const missing = await request("/api/admin/imports/other-user/jobs/job-1/fail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: "stuck" }),
    });
    expect(missing.status).toBe(404);
    expect(missing.status).not.toBe(403);

    adminOps.failOpsImportJob.mockResolvedValueOnce({ ok: true as const });
    const ok = await request("/api/admin/imports/user-a/jobs/job-1/fail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: "stuck" }),
    });
    expect(ok.status).toBe(200);
    expect(adminOps.failOpsImportJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "admin-1" }),
      "user-a",
      "job-1",
      "stuck",
    );
  });

  it("resets a flag overlay to env", async () => {
    getSession.mockResolvedValue(sessionUser({ role: "admin", id: "admin-1" }));
    adminOps.resetOpsFlag.mockResolvedValueOnce({ ok: true as const });
    const res = await request("/api/admin/flags/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "signup_disabled" }),
    });
    expect(res.status).toBe(200);
    expect(adminOps.resetOpsFlag).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "admin-1" }),
      "signup_disabled",
    );
  });

  it("sends an email self-test only to the staff session user", async () => {
    getSession.mockResolvedValue(sessionUser({ role: "admin", id: "admin-1", email: "staff@example.com" }));
    adminOps.sendOpsEmailTest.mockResolvedValueOnce({ ok: true as const, result: "skipped" as const });
    const res = await request("/api/admin/email/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "password_changed", to: "victim@example.com" }),
    });
    expect(res.status).toBe(200);
    expect(adminOps.sendOpsEmailTest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "admin-1", email: "staff@example.com" }),
      "password_changed",
    );
    expect(adminOps.sendOpsEmailTest.mock.calls[0]?.[2]).not.toBe("victim@example.com");
  });

  it("returns maps probe without URLs or tokens", async () => {
    getSession.mockResolvedValue(sessionUser({ role: "developer", id: "dev-1" }));
    const res = await request("/api/admin/maps/probe");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { probes: { name: string }[] };
    const json = JSON.stringify(body);
    expect(json).not.toMatch(/https?:\/\//);
    expect(json).not.toMatch(/sk_|whsec_|re_/);
    expect(payloadLooksLikeLocationPii(body)).toBe(false);
    expect(body.probes.map((p) => p.name)).toEqual(["tiles", "osrm", "geocode"]);
  });

  it("404s developer on new mutation routes", async () => {
    getSession.mockResolvedValue(sessionUser({ role: "developer", id: "dev-1" }));
    const paths = [
      ["/api/admin/users", "POST", { email: "x@example.com" }],
      ["/api/admin/flags/reset", "POST", { key: "signup_disabled" }],
      ["/api/admin/email/test", "POST", { kind: "password_changed" }],
      ["/api/admin/imports/user-a/jobs/job-1/fail", "POST", { confirm: "stuck" }],
      ["/api/admin/exports/user-a/jobs/job-1/fail", "POST", { confirm: "stuck" }],
    ] as const;
    for (const [path, method, body] of paths) {
      const res = await request(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(res.status, `${method} ${path}`).toBe(404);
      expect(res.status).not.toBe(403);
    }
  });
});
