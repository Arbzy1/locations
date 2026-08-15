import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestApp, sessionUser } from "@tests/helpers/api-app";
import { testEnv } from "@tests/helpers/env";
import { payloadLooksLikeLocationPii } from "@locations/api/admin-guards";

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

describe("admin diagnostics", () => {
  beforeEach(() => {
    getSession.mockResolvedValue(sessionUser({ role: "developer", id: "dev-1" }));
  });

  it("returns booleans and never keys", async () => {
    const res = await requestApp(app, "/api/admin/diagnostics", {}, testEnv());
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.worker).toBe(true);
    expect(typeof body.stripeConfigured).toBe("boolean");
    expect(JSON.stringify(body)).not.toMatch(/sk_|whsec_|re_/);
    expect(payloadLooksLikeLocationPii(body)).toBe(false);
  });
});

describe("admin flags patch", () => {
  it("returns 400 on empty body for admin and 404 for developer", async () => {
    getSession.mockResolvedValue(sessionUser({ role: "admin", id: "admin-1" }));
    const empty = await requestApp(
      app,
      "/api/admin/flags",
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" },
      testEnv(),
    );
    expect(empty.status).toBe(400);

    getSession.mockResolvedValue(sessionUser({ role: "developer", id: "dev-1" }));
    const denied = await requestApp(
      app,
      "/api/admin/flags",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ globe_enabled: false }),
      },
      testEnv(),
    );
    expect(denied.status).toBe(404);
  });
});
