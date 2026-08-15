import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestApp, sessionUser } from "@tests/helpers/api-app";
import { testEnv } from "@tests/helpers/env";

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

describe("admin user wipe", () => {
  beforeEach(() => {
    getSession.mockResolvedValue(sessionUser({ role: "admin", id: "admin-1" }));
    adminOps.wipeOpsUser.mockReset();
  });

  it("requires matching email then calls wipe", async () => {
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
    expect(adminOps.wipeOpsUser).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "admin-1", role: "admin" }),
      "u2",
      "u2@example.com",
    );
  });
});
