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
import { patchSource } from "@locations/api/services";

const env = testEnv();

async function request(path: string, init?: RequestInit) {
  return requestApp(app, path, init, env);
}

describe("PATCH /api/sources/:id color", () => {
  beforeEach(() => {
    getSession.mockReset();
    vi.mocked(patchSource).mockReset();
    vi.mocked(patchSource).mockResolvedValue({ id: "src-1", label: "Phone", color: "visit" });
  });

  it("rejects unauthenticated access", async () => {
    getSession.mockResolvedValue(null);
    const res = await request("/api/sources/src-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color: "visit" }),
    });
    expect(res.status).toBe(401);
    expect(patchSource).not.toHaveBeenCalled();
  });

  it("blocks demo users", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "demo-1", role: "demo" }));
    const res = await request("/api/sources/src-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color: "visit" }),
    });
    expect(res.status).toBe(403);
    expect(patchSource).not.toHaveBeenCalled();
  });

  it("sets an allowlisted colour for the owner", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    const res = await request("/api/sources/src-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color: "visit" }),
    });
    expect(res.status).toBe(200);
    expect(patchSource).toHaveBeenCalledWith(expect.anything(), "user-a", "src-1", {
      label: undefined,
      color: "visit",
    });
  });

  it("rejects a raw hex colour", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    const res = await request("/api/sources/src-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color: "#ff00aa" }),
    });
    expect(res.status).toBe(400);
    expect(patchSource).not.toHaveBeenCalled();
  });

  it("returns 404 for a foreign source", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    vi.mocked(patchSource).mockResolvedValueOnce({ error: "Source not found" });
    const res = await request("/api/sources/src-other", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color: "walk" }),
    });
    expect(res.status).toBe(404);
  });
});
