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
import { getOverview } from "@locations/api/services";

const env = testEnv();

async function request(path: string, init?: RequestInit) {
  return requestApp(app, path, init, env);
}

describe("GET /api/overview", () => {
  beforeEach(() => {
    getSession.mockReset();
    vi.mocked(getOverview).mockReset();
    vi.mocked(getOverview).mockResolvedValue({
      total_records: 0,
      total_visits: 0,
      total_activities: 0,
      total_distance_miles: 0,
      date_range: ["", ""],
      days_with_data: 0,
      unique_places: 0,
    });
  });

  it("rejects unauthenticated access", async () => {
    getSession.mockResolvedValue(null);
    const res = await request("/api/overview");
    expect(res.status).toBe(401);
    expect(getOverview).not.toHaveBeenCalled();
  });

  it("returns owner data", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    const res = await request("/api/overview");
    expect(res.status).toBe(200);
    expect(getOverview).toHaveBeenCalledWith(expect.anything(), "user-a");
  });

  it("scopes reads to the session tenant", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-b" }));
    await request("/api/overview");
    expect(getOverview).toHaveBeenCalledWith(expect.anything(), "user-b");
    expect(getOverview).not.toHaveBeenCalledWith(expect.anything(), "user-a");
  });

  it("allows demo reads", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "demo-1", role: "demo" }));
    const res = await request("/api/overview");
    expect(res.status).toBe(200);
    expect(getOverview).toHaveBeenCalledWith(expect.anything(), "demo");
  });
});
