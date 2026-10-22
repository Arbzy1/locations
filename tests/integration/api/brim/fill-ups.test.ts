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
import { brimMemory, resetBrimMemory } from "@tests/helpers/brim-repo";

/** Brim-era call shape: request(path, init, envOverrides). Paths are /api/brim/*. */
const app = {
  request(path: string, init: RequestInit = {}, overrides: Partial<Env> = {}) {
    return requestApp(locationsApp, path, init, testEnv(overrides));
  },
};

beforeEach(() => {
  resetRateLimits();
  getSession.mockImplementation(async () => sessionUser());
});

const env = { BRIM_FIXTURES: '1' };

function cookieFrom(res: Response): string {
  return res.headers.get('set-cookie')?.split(';')[0] ?? '';
}

async function createCar(propulsion: 'petrol' | 'bev', nickname: string) {
  const created = await app.request(
    '/api/brim/vehicles',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname, kind: 'car', propulsion }),
    },
    env,
  );
  expect(created.status).toBe(201);
  const vehicle = (await created.json()) as { id: string };
  const cookie = cookieFrom(created);
  return { vehicle, cookie, headers: { 'Content-Type': 'application/json', Cookie: cookie } };
}

describe('fill-ups', () => {
  beforeEach(() => {
    resetBrimMemory();
  });

  it('rejects litres on a BEV and odometer rollback', async () => {
    const { vehicle, headers } = await createCar('bev', 'Leaf');
    const litres = await app.request(
      '/api/brim/fill-ups',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          vehicleId: vehicle.id,
          odometerMiles: 10000,
          quantity: 40,
          unit: 'litres',
          price: 0,
          brim: true,
        }),
      },
      env,
    );
    expect(litres.status).toBe(400);
    expect(((await litres.json()) as { error: string }).error).toBe('unit_mismatch');

    const first = await app.request(
      '/api/brim/fill-ups',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          vehicleId: vehicle.id,
          odometerMiles: 10000,
          quantity: 16,
          unit: 'kwh',
          price: 120,
          brim: true,
        }),
      },
      env,
    );
    expect(first.status).toBe(201);

    const rollback = await app.request(
      '/api/brim/fill-ups',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          vehicleId: vehicle.id,
          odometerMiles: 9999,
          quantity: 16,
          unit: 'kwh',
          price: 120,
          brim: true,
        }),
      },
      env,
    );
    expect(rollback.status).toBe(400);
    expect(((await rollback.json()) as { error: string }).error).toBe('odometer_rollback');
  });

  it('calibrates a BEV after four full charges', async () => {
    const { vehicle, cookie, headers } = await createCar('bev', 'Leaf calib');
    async function log(odometerMiles: number, n: number) {
      const res = await app.request(
        '/api/brim/fill-ups',
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            vehicleId: vehicle.id,
            odometerMiles,
            quantity: n === 1 ? 40 : 16,
            unit: 'kwh',
            price: 0,
            brim: true,
            occurredAt: `2026-0${n}-01T00:00:00Z`,
          }),
        },
        env,
      );
      expect(res.status).toBe(201);
    }
    await log(10000, 1);
    await log(10100, 2);
    await log(10200, 3);
    await log(10300, 4);
    const calib = await app.request(
      `/api/brim/vehicles/${vehicle.id}/calibration`,
      { headers: { Cookie: cookie } },
      env,
    );
    const json = (await calib.json()) as { sampleCount: number; confidence: string; unit?: string };
    expect(json.sampleCount).toBe(3);
    expect(json.confidence).toBe('calibrated');
    expect(json.unit).toBe('kWh/100km');
    const estimate = await app.request(
      '/api/brim/estimate',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          origin: 'Crawley',
          destination: 'London',
          vehicleId: vehicle.id,
        }),
      },
      env,
    );
    const est = (await estimate.json()) as { consumption: { tier: number; label: string } };
    expect(est.consumption.tier).toBe(0);
    expect(est.consumption.label).toBe('Based on your fill-ups');
  });

  it('drops back to building after deleting a brim fill', async () => {
    const { vehicle, cookie, headers } = await createCar('petrol', 'Delete calib');
    const ids: string[] = [];
    async function log(odometerMiles: number, n: number) {
      const res = await app.request(
        '/api/brim/fill-ups',
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            vehicleId: vehicle.id,
            odometerMiles,
            quantity: 40,
            unit: 'litres',
            price: 5800,
            brim: true,
            occurredAt: `2026-0${n}-01T00:00:00Z`,
          }),
        },
        env,
      );
      expect(res.status).toBe(201);
      ids.push(((await res.json()) as { id: string }).id);
    }
    await log(10000, 1);
    await log(10300, 2);
    await log(10600, 3);
    await log(10900, 4);
    const last = ids[ids.length - 1];
    expect(last).toBeTruthy();
    const deleted = await app.request(`/api/brim/fill-ups/${last}`, { method: 'DELETE', headers }, env);
    expect(deleted.status).toBe(200);
    const calib = await app.request(
      `/api/brim/vehicles/${vehicle.id}/calibration`,
      { headers: { Cookie: cookie } },
      env,
    );
    const json = (await calib.json()) as { sampleCount: number; confidence: string };
    expect(json.sampleCount).toBe(2);
    expect(json.confidence).toBe('building');
    const estimate = await app.request(
      '/api/brim/estimate',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          origin: 'Crawley',
          destination: 'London',
          vehicleId: vehicle.id,
        }),
      },
      env,
    );
    const est = (await estimate.json()) as { consumption: { tier: number } };
    expect(est.consumption.tier).not.toBe(0);
  });

  it('stores an optional fixture station on a liquid fill-up', async () => {
    const { vehicle, cookie, headers } = await createCar('petrol', 'Station fill');
    const created = await app.request(
      '/api/brim/fill-ups',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          vehicleId: vehicle.id,
          odometerMiles: 10000,
          quantity: 40,
          unit: 'litres',
          price: 5800,
          brim: true,
          stationId: 'ff_shell_crawley',
        }),
      },
      env,
    );
    expect(created.status).toBe(201);
    const saved = (await created.json()) as { stationId?: string; stationName?: string };
    expect(saved.stationId).toBe('ff_shell_crawley');
    expect(saved.stationName?.length).toBeGreaterThan(0);

    const listed = await app.request(
      `/api/brim/vehicles/${vehicle.id}/fill-ups`,
      { headers: { Cookie: cookie } },
      env,
    );
    const json = (await listed.json()) as {
      fillUps: Array<{ stationId?: string; stationName?: string }>;
    };
    expect(json.fillUps[0]?.stationId).toBe('ff_shell_crawley');
    expect(json.fillUps[0]?.stationName).toBe(saved.stationName);
  });

  it('rejects an unknown station and a station on a BEV charge', async () => {
    const petrol = await createCar('petrol', 'Unknown station');
    const unknown = await app.request(
      '/api/brim/fill-ups',
      {
        method: 'POST',
        headers: petrol.headers,
        body: JSON.stringify({
          vehicleId: petrol.vehicle.id,
          odometerMiles: 10000,
          quantity: 40,
          unit: 'litres',
          price: 5800,
          brim: true,
          stationId: 'not-a-station',
        }),
      },
      env,
    );
    expect(unknown.status).toBe(400);
    expect(((await unknown.json()) as { error: string }).error).toBe('unknown_station');

    const bev = await createCar('bev', 'Leaf station');
    const charged = await app.request(
      '/api/brim/fill-ups',
      {
        method: 'POST',
        headers: bev.headers,
        body: JSON.stringify({
          vehicleId: bev.vehicle.id,
          odometerMiles: 10000,
          quantity: 16,
          unit: 'kwh',
          price: 0,
          brim: true,
          stationId: 'ff_shell_crawley',
        }),
      },
      env,
    );
    expect(charged.status).toBe(400);
    expect(((await charged.json()) as { error: string }).error).toBe('unknown_station');
  });
});
