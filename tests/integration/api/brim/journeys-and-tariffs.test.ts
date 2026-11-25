import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestApp, sessionUser } from "@tests/helpers/api-app";
import { testEnv } from "@tests/helpers/env";
import type { Env } from "@locations/api/env";

const getSession = vi.fn(async () => sessionUser());

vi.mock("@locations/api/auth", () => ({
  createAuth: () => ({
    handler: async () => new Response("auth"),
    api: { getSession: (...args: unknown[]) => getSession(...(args as [])) },
  }),
}));

vi.mock("@locations/api/services", async () => {
  const { createServicesMock: factory } = await import("@tests/helpers/api-app");
  return factory();
});

vi.mock("@locations/api/brim/db/repo", () => import("@tests/helpers/brim-repo"));

import { app as locationsApp } from "@locations/api/index";
import { resetRateLimits } from "@locations/api/rate-limit";
import { resetBrimMemory } from "@tests/helpers/brim-repo";

const app = {
  request(path: string, init: RequestInit = {}, overrides: Partial<Env> = {}) {
    return requestApp(locationsApp, path, init, testEnv(overrides));
  },
};

const env = { BRIM_FIXTURES: "1" };

describe("vehicles, tariffs, and journeys completion", () => {
  beforeEach(() => {
    resetRateLimits();
    resetBrimMemory();
    getSession.mockImplementation(async () => sessionUser({ id: "user-a", email: "a@example.com" }));
  });

  it("persists manual consumption, preserves dvla euro source, clears null fields, and supports tariff PATCH/DELETE", async () => {
    const created = await app.request(
      "/api/brim/vehicles",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: "ID.3",
          kind: "car",
          propulsion: "bev",
          year: 2022,
          euroStatus: "Euro 6",
          euroStatusSource: "dvla",
          userEnteredConsumption: 4.1,
          userEnteredUnit: "mi/kWh",
          batteryKwhUsable: 58,
          vrm: "AB12CDE",
        }),
      },
      env,
    );
    expect(created.status).toBe(201);
    const car = (await created.json()) as {
      id: string;
      user_entered_consumption?: number;
      user_entered_unit?: string;
      euro_status_source?: string;
      vrmStored?: boolean;
    };
    expect(car.user_entered_consumption).toBe(4.1);
    expect(car.user_entered_unit).toBe("mi/kWh");
    expect(car.euro_status_source).toBe("dvla");
    expect(car.vrmStored).toBe(false);

    // Edit nickname and clear year with null while leaving euroStatus unchanged -> dvla source stays
    const patched = await app.request(
      `/api/brim/vehicles/${car.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: "Family ID.3", euroStatus: "Euro 6", year: null }),
      },
      env,
    );
    expect(patched.status).toBe(200);
    const updatedCar = (await patched.json()) as {
      nickname?: string;
      year?: number;
      euro_status_source?: string;
    };
    expect(updatedCar.nickname).toBe("Family ID.3");
    expect(updatedCar.year).toBeUndefined();
    expect(updatedCar.euro_status_source).toBe("dvla");

    // Tariff CRUD
    const tCreated = await app.request(
      `/api/brim/vehicles/${car.id}/tariffs`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "home",
          pencePerKwh: 24.5,
          offpeakPence: 7.5,
          offpeakWindow: "00:30-05:30",
          isDefault: true,
        }),
      },
      env,
    );
    expect(tCreated.status).toBe(201);
    const tariff = (await tCreated.json()) as { id: string; pence_per_kwh: number };

    const tPatched = await app.request(
      `/api/brim/vehicles/${car.id}/tariffs/${tariff.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pencePerKwh: 22.0, offpeakPence: null }),
      },
      env,
    );
    expect(tPatched.status).toBe(200);
    const updatedTariff = (await tPatched.json()) as {
      pence_per_kwh: number;
      offpeak_pence?: number;
    };
    expect(updatedTariff.pence_per_kwh).toBe(22);
    expect(updatedTariff.offpeak_pence).toBeUndefined();

    // Cross-tenant 404
    getSession.mockImplementation(async () => sessionUser({ id: "user-b", email: "b@example.com" }));
    const crossPatch = await app.request(
      `/api/brim/vehicles/${car.id}/tariffs/${tariff.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pencePerKwh: 1 }),
      },
      env,
    );
    expect(crossPatch.status).toBe(404);

    getSession.mockImplementation(async () => sessionUser({ id: "user-a", email: "a@example.com" }));
    const tDeleted = await app.request(
      `/api/brim/vehicles/${car.id}/tariffs/${tariff.id}`,
      { method: "DELETE" },
      env,
    );
    expect(tDeleted.status).toBe(200);
  });

  it("checks vehicle ownership on journey save, stores polyline, and escapes CSV formula prefixes", async () => {
    const carRes = await app.request(
      "/api/brim/vehicles",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: "",
          make: "Honda",
          model: "CB500X",
          kind: "motorcycle",
          propulsion: "petrol",
        }),
      },
      env,
    );
    expect(carRes.status).toBe(201);
    const bike = (await carRes.json()) as { id: string };

    // Cross-tenant vehicleId on journey save returns 404
    getSession.mockImplementation(async () => sessionUser({ id: "user-b", email: "b@example.com" }));
    const crossJourney = await app.request(
      "/api/brim/journeys",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: "Crawley",
          destination: "London",
          vehicleId: bike.id,
          estimate: {
            distanceMeters: 48280,
            durationSeconds: 3600,
            charges: [],
            cost: {
              energyPence: { point: 500 },
              chargesPence: 0,
              totalPence: { point: 500 },
            },
          },
        }),
      },
      env,
    );
    expect(crossJourney.status).toBe(404);

    getSession.mockImplementation(async () => sessionUser({ id: "user-a", email: "a@example.com" }));
    const saved = await app.request(
      "/api/brim/journeys",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: "=CMD|' /C calc'!A0",
          destination: "+London Bridge",
          vehicleId: bike.id,
          departsAt: new Date().toISOString(),
          estimate: {
            distanceMeters: 160934.4,
            durationSeconds: 7200,
            encodedPolyline: "_p~iF~ps|U_ulLnnqC",
            charges: [],
            cost: {
              energyPence: { point: 1200 },
              chargesPence: 0,
              totalPence: { point: 1200 },
            },
            hmrc: { approvedPence: 2400 },
          },
        }),
      },
      env,
    );
    expect(saved.status).toBe(201);
    const savedBody = (await saved.json()) as { id: string; polyline?: string };
    expect(savedBody.polyline).toBe("_p~iF~ps|U_ulLnnqC");

    const summary = await app.request("/api/brim/journeys/summary", {}, env);
    expect(summary.status).toBe(200);
    const sumBody = (await summary.json()) as { approvedPence: number; miles: number };
    // 100 miles on a motorcycle = 24p/mile = 2400p
    expect(sumBody.miles).toBeCloseTo(100, 3);
    expect(sumBody.approvedPence).toBe(2400);

    const csvRes = await app.request("/api/brim/journeys/export", {}, env);
    expect(csvRes.status).toBe(200);
    const csvText = await csvRes.text();
    expect(csvText).toContain("Honda CB500X");
    expect(csvText).toContain("'=CMD|' /C calc'!A0");
    expect(csvText).toContain("'+London Bridge");
  });
});
