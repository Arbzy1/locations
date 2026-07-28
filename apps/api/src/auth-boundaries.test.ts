import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "./env";

const getSession = vi.fn();

vi.mock("./auth", () => ({
  createAuth: () => ({
    handler: async () => new Response("auth"),
    api: {
      getSession: (...args: unknown[]) => getSession(...args),
    },
  }),
}));

vi.mock("./services", () => ({
  getDb: vi.fn(() => ({})),
  getOverview: vi.fn(async () => ({ ok: true })),
  getDays: vi.fn(async () => []),
  getDay: vi.fn(),
  getHeatmap: vi.fn(async () => []),
  getAnalytics: vi.fn(async () => []),
  getRouteProgress: vi.fn(async () => ({})),
  resolveCoords: vi.fn(async () => ({ name: "Unknown", address: "" })),
  listSources: vi.fn(async () => []),
  getSourceById: vi.fn(async () => null),
  renameSource: vi.fn(async () => ({ error: "Source not found" as const })),
  removeSource: vi.fn(async () => ({ error: "Source not found" as const })),
  getImportStatus: vi.fn(async () => ({})),
  createImportJob: vi.fn(),
  ensureDataSource: vi.fn(),
  importSourceData: vi.fn(),
  updateImportJob: vi.fn(),
}));

import { app } from "./index";
import { getSourceById, renameSource, removeSource } from "./services";

const env = {
  DATABASE_URL: "postgres://test",
  BETTER_AUTH_SECRET: "test-secret-at-least-32-chars-long!!",
  BETTER_AUTH_URL: "http://127.0.0.1:8787",
  ASSETS: { fetch: async () => new Response("asset") },
  UPLOADS: {
    put: vi.fn(),
    get: vi.fn(),
  },
} as unknown as Env;

const executionCtx = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
  props: {},
} as unknown as ExecutionContext;

function sessionUser(overrides: {
  id?: string;
  email?: string;
  name?: string;
  role?: string;
} = {}) {
  return {
    user: {
      id: overrides.id ?? "user-a",
      email: overrides.email ?? "a@example.com",
      name: overrides.name ?? "User A",
      role: overrides.role ?? "user",
    },
  };
}

async function request(path: string, init?: RequestInit) {
  return app.request(path, init, env, executionCtx);
}

describe("API auth boundaries", () => {
  beforeEach(() => {
    getSession.mockReset();
    vi.mocked(getSourceById).mockReset();
    vi.mocked(renameSource).mockReset();
    vi.mocked(removeSource).mockReset();
    vi.mocked(renameSource).mockResolvedValue({ error: "Source not found" });
    vi.mocked(removeSource).mockResolvedValue({ error: "Source not found" });
    vi.mocked(getSourceById).mockResolvedValue(null);
  });

  it("allows unauthenticated access to /api/health", async () => {
    getSession.mockResolvedValue(null);
    const res = await request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(getSession).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated access to /api/overview", async () => {
    getSession.mockResolvedValue(null);
    const res = await request("/api/overview");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
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
    expect(renameSource).not.toHaveBeenCalled();
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
    vi.mocked(renameSource).mockResolvedValue({ error: "Source not found" });

    const res = await request("/api/sources/other-tenant-source", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Stolen" }),
    });

    expect(res.status).toBe(404);
    expect(renameSource).toHaveBeenCalledWith(
      expect.anything(),
      "user-a",
      "other-tenant-source",
      "Stolen",
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
});
