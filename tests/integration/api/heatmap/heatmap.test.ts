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
import { enrichHeatmapSettlements, getHeatmap } from "@locations/api/services";

const env = testEnv();

async function request(path: string, init?: RequestInit) {
  return requestApp(app, path, init, env);
}

describe("GET /api/heatmap", () => {
  beforeEach(() => {
    getSession.mockReset();
    vi.mocked(getHeatmap).mockReset();
    vi.mocked(enrichHeatmapSettlements).mockReset();
    vi.mocked(getHeatmap).mockResolvedValue([]);
    vi.mocked(enrichHeatmapSettlements).mockImplementation(async (_db, points) => points ?? []);
  });

  it("rejects unauthenticated access", async () => {
    getSession.mockResolvedValue(null);
    const res = await request("/api/heatmap");
    expect(res.status).toBe(401);
    expect(getHeatmap).not.toHaveBeenCalled();
  });

  it("returns owner data and enriches settlements outside the tenant transaction", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    vi.mocked(getHeatmap).mockResolvedValueOnce([{ lat: 1, lon: 2 }] as never);
    const res = await request("/api/heatmap");
    expect(res.status).toBe(200);
    expect(getHeatmap).toHaveBeenCalledWith(expect.anything(), "user-a", expect.anything());
    expect(enrichHeatmapSettlements).toHaveBeenCalled();
  });

  it("scopes reads to the session tenant", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-b" }));
    await request("/api/heatmap");
    expect(getHeatmap).toHaveBeenCalledWith(expect.anything(), "user-b", expect.anything());
    expect(getHeatmap).not.toHaveBeenCalledWith(expect.anything(), "user-a", expect.anything());
  });

  it("allows demo reads", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "demo-1", role: "demo" }));
    const res = await request("/api/heatmap");
    expect(res.status).toBe(200);
    expect(getHeatmap).toHaveBeenCalledWith(expect.anything(), "demo", expect.anything());
  });
});
