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

const fixtures = { BRIM_FIXTURES: '1' };

async function estimate(body: unknown) {
  return app.request(
    '/api/brim/estimate',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    fixtures,
  );
}

describe('estimate contracts', () => {
  it('makes total pence equal energy plus charges', async () => {
    const res = await estimate({
      origin: 'Crawley',
      destination: 'London',
      propulsion: 'petrol',
      departsAt: '2026-08-14T08:00:00Z',
      vehicleInline: { kind: 'car', propulsion: 'petrol', userEnteredConsumption: 40, userEnteredUnit: 'mpg' },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      cost: { energyPence: { point: number }; chargesPence: number; totalPence: { point: number } };
      charges: Array<{ pence: number }>;
    };
    expect(json.charges.length).toBeGreaterThan(0);
    expect(json.cost.chargesPence).toBe(json.charges.reduce((sum, c) => sum + c.pence, 0));
    expect(json.cost.totalPence.point).toBe(json.cost.energyPence.point + json.cost.chargesPence);
  });

  it('lets typed mi/kWh override an official BEV figure', async () => {
    const res = await estimate({
      origin: 'Crawley',
      destination: 'London',
      propulsion: 'bev',
      vehicleInline: {
        kind: 'car',
        propulsion: 'bev',
        officialConsumption: 15,
        officialUnit: 'kWh/100km',
        officialCycle: 'WLTP',
        userEnteredConsumption: 4,
        userEnteredUnit: 'mi/kWh',
        batteryKwhUsable: 64,
        startChargePercent: 90,
      },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { consumption: { tier: number; label: string } };
    expect(json.consumption.tier).toBe(1);
    expect(json.consumption.label).toBe('You told us');
  });

  it('rejects an empty body and a bad pin', async () => {
    const empty = await estimate({});
    expect(empty.status).toBe(400);
    const pin = await estimate({
      origin: { lat: 200, lng: 0 },
      destination: 'London',
      propulsion: 'steam',
    });
    expect(pin.status).toBe(400);
  });

  it('lengthens a two-stop journey when a waypoint is added', async () => {
    const direct = await estimate({ origin: 'Crawley', destination: 'London', propulsion: 'petrol' });
    const via = await estimate({
      origin: 'Crawley',
      destination: 'London',
      waypoints: ['Birmingham'],
      propulsion: 'petrol',
    });
    expect(direct.status).toBe(200);
    expect(via.status).toBe(200);
    const a = (await direct.json()) as { distanceMeters: number };
    const b = (await via.json()) as { distanceMeters: number };
    expect(b.distanceMeters).toBeGreaterThan(a.distanceMeters);
  });

  it('fails open on carbon intensity when leave time is outside the fixture window', async () => {
    const res = await estimate({
      origin: 'Crawley',
      destination: 'London',
      propulsion: 'bev',
      departsAt: '1999-01-01T12:00:00Z',
      nowIso: '1999-01-01T12:00:00Z',
      vehicleInline: {
        kind: 'car',
        propulsion: 'bev',
        batteryKwhUsable: 64,
        startChargePercent: 90,
      },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { reasons: string[]; cost: { totalPence: { point: number } } };
    expect(json.reasons.some((r) => r.includes('150 g/kWh'))).toBe(true);
    expect(json.cost.totalPence.point).toBeGreaterThan(0);
  });
});
