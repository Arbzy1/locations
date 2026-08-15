import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestApp } from "@tests/helpers/api-app";
import { testEnv } from "@tests/helpers/env";
import { resetRateLimits } from "@locations/api/rate-limit";
import type { Env } from "@locations/api/env";

const signInEmail = vi.fn(async () => new Response("ok", { status: 200 }));

vi.mock("@locations/api/auth", () => ({
  createAuth: () => ({
    handler: async () => new Response("auth"),
    api: {
      getSession: async () => null,
      signInEmail: (...args: unknown[]) => signInEmail(...args),
    },
  }),
}));

vi.mock("@locations/api/services", async () => {
  const { createServicesMock } = await import("@tests/helpers/api-app");
  return createServicesMock();
});

import { app } from "@locations/api/index";

function request(path: string, init?: RequestInit, env: Env = testEnv()) {
  return requestApp(app, path, init, env);
}

describe("POST /api/auth/demo", () => {
  beforeEach(() => {
    resetRateLimits();
    signInEmail.mockReset();
    signInEmail.mockResolvedValue(new Response("ok", { status: 200 }));
  });

  it("returns 503 when DEMO_PASSWORD is unset", async () => {
    const res = await request(
      "/api/auth/demo",
      { method: "POST", body: JSON.stringify({ password: "from-client" }) },
      testEnv({ DEMO_EMAIL: "demo@locations.app" }),
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toMatch(/password|from-client/i);
    expect(signInEmail).not.toHaveBeenCalled();
  });

  it("signs in with server DEMO_EMAIL and DEMO_PASSWORD, not the request body", async () => {
    const env = testEnv({
      DEMO_EMAIL: "demo@locations.app",
      DEMO_PASSWORD: "server-demo-secret",
    });
    const res = await request(
      "/api/auth/demo",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "attacker@example.com", password: "from-client" }),
      },
      env,
    );
    expect(res.status).toBe(200);
    expect(signInEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { email: "demo@locations.app", password: "server-demo-secret" },
        asResponse: true,
      }),
    );
    const body = signInEmail.mock.calls[0]?.[0] as { body: { email: string; password: string } };
    expect(body.body.email).not.toBe("attacker@example.com");
    expect(body.body.password).not.toBe("from-client");
  });

  it("rate-limits demo login per IP", async () => {
    const env = testEnv({
      DEMO_EMAIL: "demo@locations.app",
      DEMO_PASSWORD: "server-demo-secret",
    });
    const headers = { "cf-connecting-ip": "203.0.113.9" };
    for (let i = 0; i < 10; i++) {
      const res = await request("/api/auth/demo", { method: "POST", headers }, env);
      expect(res.status).toBe(200);
    }
    const blocked = await request("/api/auth/demo", { method: "POST", headers }, env);
    expect(blocked.status).toBe(429);
    expect(signInEmail).toHaveBeenCalledTimes(10);
  });
});
