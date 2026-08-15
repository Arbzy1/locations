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
import { searchTenant } from "@locations/api/services";

const env = testEnv();

async function request(path: string) {
  return requestApp(app, path, undefined, env);
}

describe("GET /api/search", () => {
  beforeEach(() => {
    getSession.mockReset();
    vi.mocked(searchTenant).mockReset();
    vi.mocked(searchTenant).mockResolvedValue({ places: [], days: [] });
  });

  it("rejects unauthenticated access", async () => {
    getSession.mockResolvedValue(null);
    const res = await request("/api/search?q=home");
    expect(res.status).toBe(401);
    expect(searchTenant).not.toHaveBeenCalled();
  });

  it("returns owner results scoped to the session tenant", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    vi.mocked(searchTenant).mockResolvedValueOnce({
      places: [{ cluster: "park", lat: 1, lon: 2, date: "2024-01-01" }],
      days: [{ date: "2024-01-01" }],
    } as never);
    const res = await request("/api/search?q=park");
    expect(res.status).toBe(200);
    expect(searchTenant).toHaveBeenCalledWith(expect.anything(), "user-a", "park");
    const body = (await res.json()) as { places: { cluster: string }[] };
    expect(body.places[0]?.cluster).toBe("park");
  });

  it("does not return hidden clusters from the service payload", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    vi.mocked(searchTenant).mockResolvedValueOnce({
      places: [{ cluster: "park", lat: 1, lon: 2, date: "2024-01-01" }],
      days: [],
    } as never);
    const res = await request("/api/search?q=park");
    const body = (await res.json()) as { places: { cluster: string }[] };
    expect(body.places.every((p) => p.cluster !== "secret")).toBe(true);
  });
});
