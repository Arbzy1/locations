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
import { deleteTenantDateRange } from "@locations/api/services";

const env = testEnv();

async function request(path: string, init?: RequestInit) {
  return requestApp(app, path, init, env);
}

describe("DELETE /api/days", () => {
  beforeEach(() => {
    getSession.mockReset();
    vi.mocked(deleteTenantDateRange).mockReset();
    vi.mocked(deleteTenantDateRange).mockResolvedValue({
      visitCount: 2,
      activityCount: 1,
      days: 3,
    });
  });

  it("rejects unauthenticated access", async () => {
    getSession.mockResolvedValue(null);
    const res = await request("/api/days?from=2024-01-01&to=2024-01-31", { method: "DELETE" });
    expect(res.status).toBe(401);
    expect(deleteTenantDateRange).not.toHaveBeenCalled();
  });

  it("blocks demo users", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "demo-1", role: "demo" }));
    const res = await request("/api/days?from=2024-01-01&to=2024-01-31", { method: "DELETE" });
    expect(res.status).toBe(403);
    expect(deleteTenantDateRange).not.toHaveBeenCalled();
  });

  it("deletes an owner date range", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    const res = await request("/api/days?from=2024-01-01&to=2024-01-07", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(deleteTenantDateRange).toHaveBeenCalledWith(expect.anything(), "user-a", {
      from: "2024-01-01",
      to: "2024-01-07",
      sourceId: undefined,
    });
  });

  it("returns 404 for a foreign source id", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    vi.mocked(deleteTenantDateRange).mockResolvedValueOnce({ error: "Source not found" });
    const res = await request("/api/days?from=2024-01-01&to=2024-01-07&sourceId=src-other", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });
});
