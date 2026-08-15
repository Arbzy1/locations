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
import { upsertUserSettings } from "@locations/api/services";

const env = testEnv();

describe("account settings PATCH", () => {
  beforeEach(() => {
    getSession.mockReset();
    vi.mocked(upsertUserSettings).mockReset();
    vi.mocked(upsertUserSettings).mockResolvedValue({
      tenant: "user-a",
      distanceUnit: "mi",
      timezone: "Europe/London",
      monthlyRecapEnabled: true,
      monthlyRecapLastYm: null,
      mapBookmarks: [],
      mapTileDarkUrl: null,
      mapTileLightUrl: null,
    } as never);
  });

  it("rejects unauthenticated access", async () => {
    getSession.mockResolvedValue(null);
    const res = await requestApp(app, "/api/account/settings", { method: "PATCH", body: "{}" }, env);
    expect(res.status).toBe(401);
    expect(upsertUserSettings).not.toHaveBeenCalled();
  });

  it("saves owner recap and timezone", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    const res = await requestApp(
      app,
      "/api/account/settings",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          distanceUnit: "km",
          timezone: "Europe/London",
          monthlyRecapEnabled: true,
        }),
      },
      env,
    );
    expect(res.status).toBe(200);
    expect(upsertUserSettings).toHaveBeenCalledWith(
      expect.anything(),
      "user-a",
      expect.objectContaining({ monthlyRecapEnabled: true, timezone: "Europe/London" }),
    );
  });

  it("blocks demo writes", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "demo-1", role: "demo" }));
    const res = await requestApp(
      app,
      "/api/account/settings",
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" },
      env,
    );
    expect(res.status).toBe(403);
    expect(upsertUserSettings).not.toHaveBeenCalled();
  });

  it("rejects custom tiles when the host is not allowlisted", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    const res = await requestApp(
      app,
      "/api/account/settings",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mapTileDarkUrl: "https://evil.test/{z}/{x}/{y}.png",
        }),
      },
      env,
    );
    expect(res.status).toBe(400);
    expect(upsertUserSettings).not.toHaveBeenCalled();
  });

  it("rejects more than 20 bookmarks", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    const mapBookmarks = Array.from({ length: 21 }, (_, i) => ({
      id: `id-${i}`,
      name: "V",
      lng: 0,
      lat: 0,
      zoom: 1,
      pitch: 0,
      bearing: 0,
    }));
    const res = await requestApp(
      app,
      "/api/account/settings",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mapBookmarks }),
      },
      env,
    );
    expect(res.status).toBe(400);
    expect(upsertUserSettings).not.toHaveBeenCalled();
  });
});
