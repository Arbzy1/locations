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
import { getAnalytics } from "@locations/api/services";

const env = testEnv();
const KEYS = [
  "/api/analytics/flights",
  "/api/analytics/train-hops",
  "/api/analytics/low-movement",
  "/api/analytics/streaks",
  "/api/analytics/place-deltas",
  "/api/analytics/lapsed-places",
  "/api/analytics/hour-of-week",
  "/api/analytics/personality",
] as const;

async function request(path: string, init?: RequestInit) {
  return requestApp(app, path, init, env);
}

describe("analytics travel routes", () => {
  beforeEach(() => {
    getSession.mockReset();
    vi.mocked(getAnalytics).mockReset();
    vi.mocked(getAnalytics).mockResolvedValue([]);
  });

  it.each(KEYS)("rejects unauthenticated access to %s", async (path) => {
    getSession.mockResolvedValue(null);
    const res = await request(path);
    expect(res.status).toBe(401);
    expect(getAnalytics).not.toHaveBeenCalled();
  });

  it.each(KEYS)("returns owner data for %s", async (path) => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    vi.mocked(getAnalytics).mockResolvedValueOnce({ tagged: 1 } as never);
    const res = await request(path);
    expect(res.status).toBe(200);
    expect(getAnalytics).toHaveBeenCalledWith(
      expect.anything(),
      "user-a",
      path.replace("/api/analytics/", ""),
    );
  });

  it.each(KEYS)("scopes %s to the session tenant", async (path) => {
    getSession.mockResolvedValue(sessionUser({ id: "user-b" }));
    await request(path);
    expect(getAnalytics).toHaveBeenCalledWith(
      expect.anything(),
      "user-b",
      path.replace("/api/analytics/", ""),
    );
    expect(getAnalytics).not.toHaveBeenCalledWith(expect.anything(), "user-a", expect.anything());
  });

  it.each(KEYS)("allows demo reads of %s", async (path) => {
    getSession.mockResolvedValue(sessionUser({ id: "demo-1", role: "demo" }));
    const res = await request(path);
    expect(res.status).toBe(200);
    expect(getAnalytics).toHaveBeenCalledWith(
      expect.anything(),
      "demo",
      path.replace("/api/analytics/", ""),
    );
  });
});
