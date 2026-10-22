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

vi.mock("@locations/api/brim/db/repo", () => import("@tests/helpers/brim-repo"));

import { app } from "@locations/api/index";
import { resetRateLimits } from "@locations/api/rate-limit";
import { brimMemory, resetBrimMemory } from "@tests/helpers/brim-repo";

const env = testEnv({ BRIM_FIXTURES: "1" });
const userA = sessionUser({ id: "user-a", email: "a@example.com" });
const userB = sessionUser({ id: "user-b", email: "b@example.com" });
const demo = sessionUser({ id: "demo-1", role: "demo" });

function json(path: string, method: string, body?: unknown) {
  return requestApp(
    app,
    path,
    {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    env,
  );
}

async function createVehicleAs(session: unknown) {
  getSession.mockResolvedValue(session);
  const res = await json("/api/brim/vehicles", "POST", { nickname: "Golf", kind: "car", propulsion: "petrol" });
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string };
}

describe("journey cost tenant boundaries", () => {
  beforeEach(() => {
    getSession.mockReset();
    resetRateLimits();
    resetBrimMemory();
  });

  it("returns 401 without a session", async () => {
    getSession.mockResolvedValue(null);
    for (const [path, method] of [
      ["/api/brim/vehicles", "GET"],
      ["/api/brim/estimate", "POST"],
      ["/api/brim/journeys", "GET"],
    ] as const) {
      const res = await json(path, method, method === "POST" ? {} : undefined);
      expect(res.status, path).toBe(401);
    }
  });

  it("stores vehicles under the session tenant and lists them for the owner", async () => {
    const vehicle = await createVehicleAs(userA);
    expect(brimMemory().vehicles.get(vehicle.id)?.tenant).toBe("user-a");
    const res = await json("/api/brim/vehicles", "GET");
    const body = (await res.json()) as { vehicles: Array<{ id: string }> };
    expect(body.vehicles.map((v) => v.id)).toEqual([vehicle.id]);
  });

  it("returns 404 for another tenant's vehicle and leaves it intact", async () => {
    const vehicle = await createVehicleAs(userA);
    getSession.mockResolvedValue(userB);
    expect((await json("/api/brim/vehicles", "GET").then((r) => r.json())) as unknown).toEqual({
      vehicles: [],
    });
    expect((await json(`/api/brim/vehicles/${vehicle.id}`, "PATCH", { nickname: "Mine" })).status).toBe(404);
    expect((await json(`/api/brim/vehicles/${vehicle.id}/tariffs`, "GET")).status).toBe(404);
    expect((await json(`/api/brim/vehicles/${vehicle.id}`, "DELETE")).status).toBe(404);
    expect(brimMemory().vehicles.get(vehicle.id)?.nickname).toBe("Golf");
  });

  it("ignores a tenant smuggled in the request body", async () => {
    getSession.mockResolvedValue(userA);
    const res = await json("/api/brim/vehicles", "POST", {
      nickname: "Sneaky",
      kind: "car",
      propulsion: "petrol",
      tenant: "user-b",
      owner_id: "user-b",
    });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect(brimMemory().vehicles.get(id)?.tenant).toBe("user-a");
  });

  it("lets demo estimate but not save", async () => {
    getSession.mockResolvedValue(demo);
    const estimate = await json("/api/brim/estimate", "POST", {
      origin: "Crawley",
      destination: "London",
      vehicle: { kind: "car", propulsion: "petrol" },
    });
    expect(estimate.status).toBe(200);
    const save = await json("/api/brim/vehicles", "POST", { nickname: "Golf", kind: "car", propulsion: "petrol" });
    expect(save.status).toBe(403);
    expect(brimMemory().vehicles.size).toBe(0);
  });
});
