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

import { app } from "@locations/api/index";
import { wipeTenantData } from "@locations/api/services";

const env = testEnv();

function request(path: string, init?: RequestInit) {
  return requestApp(app, path, init, env);
}

describe("POST /api/account/delete", () => {
  beforeEach(() => {
    getSession.mockReset();
    vi.mocked(wipeTenantData).mockReset();
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
  });
});
