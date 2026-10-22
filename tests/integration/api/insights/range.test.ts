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
import { getRangeInsights } from "@locations/api/services";

const env = testEnv();
const request = (path: string) => requestApp(app, path, {}, env);

describe("GET /api/insights/range", () => {
  beforeEach(() => {
    getSession.mockReset();
    vi.mocked(getRangeInsights).mockClear();
  });

  it("rejects unauthenticated access", async () => {
    getSession.mockResolvedValue(null);
    expect((await request("/api/insights/range?from=2024-01-01&to=2024-12-31")).status).toBe(401);
    expect(getRangeInsights).not.toHaveBeenCalled();
  });

  it("summarises the session tenant", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    const res = await request("/api/insights/range?from=2024-01-01&to=2024-12-31&tenant=user-b");
    expect(res.status).toBe(200);
    expect(getRangeInsights).toHaveBeenCalledWith(expect.anything(), "user-a", { from: "2024-01-01", to: "2024-12-31" });
  });

  it("lets the demo read its own sample", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "demo-1", role: "demo" }));
    expect((await request("/api/insights/range?from=2024-01-01&to=2024-12-31")).status).toBe(200);
    expect(vi.mocked(getRangeInsights).mock.calls[0]?.[1]).toBe("demo");
  });

  it("returns 400 for invalid ranges", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    vi.mocked(getRangeInsights).mockResolvedValueOnce({ error: "bad" } as never);
    expect((await request("/api/insights/range?from=x&to=y")).status).toBe(400);
  });
});
