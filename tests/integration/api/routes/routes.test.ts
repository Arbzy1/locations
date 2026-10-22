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
import { getHotspotDays, getRouteLines } from "@locations/api/services";

const env = testEnv();
const request = (path: string) => requestApp(app, path, {}, env);

describe("GET /api/routes", () => {
  beforeEach(() => {
    getSession.mockReset();
    vi.mocked(getRouteLines).mockReset();
    vi.mocked(getRouteLines).mockResolvedValue({ lines: [] } as never);
  });

  it("rejects unauthenticated access", async () => {
    getSession.mockResolvedValue(null);
    const res = await request("/api/routes?from=2024-01-01&to=2024-01-31");
    expect(res.status).toBe(401);
    expect(getRouteLines).not.toHaveBeenCalled();
  });

  it("reads the session tenant, never a client-supplied one", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    const res = await request("/api/routes?from=2024-01-01&to=2024-01-31&sources=s1,s2&tenant=user-b");
    expect(res.status).toBe(200);
    expect(getRouteLines).toHaveBeenCalledWith(expect.anything(), "user-a", {
      from: "2024-01-01",
      to: "2024-01-31",
      sourceIds: ["s1", "s2"],
    });
  });

  it("lets the demo read its own tenant", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "demo-1", role: "demo" }));
    const res = await request("/api/routes?from=2024-01-01&to=2024-01-31");
    expect(res.status).toBe(200);
    expect(vi.mocked(getRouteLines).mock.calls[0]?.[1]).toBe("demo");
  });

  it("returns 400 for invalid ranges", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    vi.mocked(getRouteLines).mockResolvedValueOnce({ error: "from and to must be YYYY-MM-DD with from <= to" });
    const res = await request("/api/routes?from=bad&to=2024-01-31");
    expect(res.status).toBe(400);
  });
});

describe("GET /api/hotspots/days", () => {
  beforeEach(() => {
    getSession.mockReset();
    vi.mocked(getHotspotDays).mockReset();
    vi.mocked(getHotspotDays).mockResolvedValue({ days: [] } as never);
  });

  it("rejects unauthenticated access", async () => {
    getSession.mockResolvedValue(null);
    expect((await request("/api/hotspots/days?lat=51.5&lon=-0.1")).status).toBe(401);
    expect(getHotspotDays).not.toHaveBeenCalled();
  });

  it("queries the session tenant with the parsed point and radius", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    const res = await request("/api/hotspots/days?lat=51.5&lon=-0.1&radius_m=200");
    expect(res.status).toBe(200);
    expect(getHotspotDays).toHaveBeenCalledWith(expect.anything(), "user-a", {
      lat: 51.5,
      lon: -0.1,
      radiusM: 200,
    });
  });

  it("returns 400 when the point is missing", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    vi.mocked(getHotspotDays).mockResolvedValueOnce({ error: "lat and lon are required" });
    expect((await request("/api/hotspots/days")).status).toBe(400);
  });
});
