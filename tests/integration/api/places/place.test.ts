import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestApp, sessionUser } from "@tests/helpers/api-app";
import { testEnv } from "@tests/helpers/env";
import { resetRateLimits } from "@locations/api/rate-limit";

const getSession = vi.fn();

vi.mock("@locations/api/auth", () => ({
  createAuth: () => ({
    handler: async () => new Response("auth"),
    api: { getSession: (...args: unknown[]) => getSession(...args) },
  }),
}));

vi.mock("@locations/api/services", async () => {
  const { createServicesMock } = await import("@tests/helpers/api-app");
  return createServicesMock();
});

import { app } from "@locations/api/index";
import { resolveCoords } from "@locations/api/services";

describe("GET /api/place/:placeId", () => {
  beforeEach(() => {
    resetRateLimits();
    getSession.mockReset();
    vi.mocked(resolveCoords).mockReset();
    vi.mocked(resolveCoords).mockResolvedValue({
      name: "Cached cafe",
      address: "1 Main St",
    } as never);
  });

  it("rejects unauthenticated access", async () => {
    getSession.mockResolvedValue(null);
    const res = await requestApp(app, "/api/place/abc?lat=40.7&lon=-74");
    expect(res.status).toBe(401);
    expect(resolveCoords).not.toHaveBeenCalled();
  });

  it("allows demo reads", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "demo-1", role: "demo" }));
    const res = await requestApp(app, "/api/place/abc?lat=40.7&lon=-74");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ name: "Cached cafe" });
  });

  it("resolves coordinates for the owner", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    const res = await requestApp(app, "/api/place/abc?lat=40.7128&lon=-74.006");
    expect(res.status).toBe(200);
    expect(resolveCoords).toHaveBeenCalledWith(expect.anything(), 40.7128, -74.006);
  });

  it("returns Unknown for invalid coordinates without calling geo", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    const res = await requestApp(app, "/api/place/abc?lat=999&lon=0");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: "Unknown", address: "" });
    expect(resolveCoords).not.toHaveBeenCalled();
  });
});
