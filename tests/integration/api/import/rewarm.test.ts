import { beforeEach, describe, expect, it, vi } from "vitest";
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
import { rewarmRoutes } from "@locations/api/services";

const env = testEnv();

async function request(path: string, init?: RequestInit) {
  return requestApp(app, path, init, env);
}

describe("POST /api/routes/rewarm", () => {
  beforeEach(() => {
    getSession.mockReset();
    vi.mocked(rewarmRoutes).mockReset();
    vi.mocked(rewarmRoutes).mockResolvedValue({ warmed: 3, remaining: 12, cap: 100 });
  });

  it("rejects unauthenticated access", async () => {
    getSession.mockResolvedValue(null);
    const res = await request("/api/routes/rewarm", { method: "POST" });
    expect(res.status).toBe(401);
    expect(rewarmRoutes).not.toHaveBeenCalled();
  });

  it("blocks demo users", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "demo-1", role: "demo" }));
    const res = await request("/api/routes/rewarm", { method: "POST" });
    expect(res.status).toBe(403);
    expect(rewarmRoutes).not.toHaveBeenCalled();
  });

  it("warms a capped batch for the owner tenant", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    const res = await request("/api/routes/rewarm", { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ warmed: 3, remaining: 12, cap: 100 });
    expect(rewarmRoutes).toHaveBeenCalledWith(expect.anything(), "user-a");
  });
});
