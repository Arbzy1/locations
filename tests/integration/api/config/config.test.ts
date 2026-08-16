import { describe, expect, it, vi } from "vitest";
import { requestApp } from "@tests/helpers/api-app";
import { testEnv } from "@tests/helpers/env";

vi.mock("@locations/api/auth", () => ({
  createAuth: () => ({
    handler: async () => new Response("auth"),
    api: { getSession: async () => null },
  }),
}));

vi.mock("@locations/api/services", async () => {
  const { createServicesMock: factory } = await import("@tests/helpers/api-app");
  return factory();
});

import { app } from "@locations/api/index";

describe("GET /api/config", () => {
  it("returns map config without auth", async () => {
    const res = await requestApp(app, "/api/config", {}, testEnv());
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.customTiles).toBe(false);
    expect(body.globe).toBe(true);
    expect(body.billingConfigured).toBe(false);
    expect(body.googleAuth).toBe(false);
    expect(body.flags).toEqual({ globe: true, demoTour: true, landing: true });
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(typeof body.mapTileDark).toBe("string");
    expect(body.mapStyleDark).toBeNull();
  });

  it("exposes custom tile hosts when configured", async () => {
    const res = await requestApp(
      app,
      "/api/config",
      {},
      testEnv({ MAP_CUSTOM_TILE_HOSTS: "tiles.example.com" }),
    );
    const body = (await res.json()) as { customTiles: boolean; customTileHosts: string[] };
    expect(body.customTiles).toBe(true);
    expect(body.customTileHosts).toEqual(["tiles.example.com"]);
  });

  it("turns feature flags off from env", async () => {
    const res = await requestApp(
      app,
      "/api/config",
      {},
      testEnv({ GLOBE_ENABLED: "false", DEMO_TOUR: "false", LANDING_ENABLED: "false" }),
    );
    const body = (await res.json()) as {
      globe: boolean;
      flags: { globe: boolean; demoTour: boolean; landing: boolean };
    };
    expect(body.globe).toBe(false);
    expect(body.flags).toEqual({ globe: false, demoTour: false, landing: false });
  });

  it("reports googleAuth only when both Google secrets are set", async () => {
    const enabled = await requestApp(
      app,
      "/api/config",
      {},
      testEnv({
        GOOGLE_CLIENT_ID: "gid.apps.googleusercontent.com",
        GOOGLE_CLIENT_SECRET: "gsec",
      }),
    );
    const enabledBody = (await enabled.json()) as { googleAuth: boolean };
    expect(enabledBody.googleAuth).toBe(true);
    expect(JSON.stringify(enabledBody)).not.toContain("gid.apps.googleusercontent.com");
    expect(JSON.stringify(enabledBody)).not.toContain("gsec");

    const idOnly = await requestApp(
      app,
      "/api/config",
      {},
      testEnv({ GOOGLE_CLIENT_ID: "gid.apps.googleusercontent.com" }),
    );
    expect(((await idOnly.json()) as { googleAuth: boolean }).googleAuth).toBe(false);
  });
});
