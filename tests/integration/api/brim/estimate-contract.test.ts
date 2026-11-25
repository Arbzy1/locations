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

  it('supports roundTrip, passengers, fuelGrade, and full alternatives breakdown', async () => {
    const oneWay = await estimate({
      origin: 'Crawley',
      destination: 'London',
      propulsion: 'petrol',
      departsAt: '2026-08-14T08:00:00Z',
    });
    const roundTrip = await estimate({
      origin: 'Crawley',
      destination: 'London',
      propulsion: 'petrol',
      fuelGrade: 'E5',
      roundTrip: true,
      passengers: 2,
      departsAt: '2026-08-14T08:00:00Z',
    });
    expect(oneWay.status).toBe(200);
    expect(roundTrip.status).toBe(200);
    const a = (await oneWay.json()) as {
      distanceMeters: number;
      durationSeconds: number;
    };
    const b = (await roundTrip.json()) as {
      distanceMeters: number;
      durationSeconds: number;
      roundTrip?: boolean;
      hmrc: { passengerPence?: number; approvedPence: number };
      alternatives: Array<{
        id: string;
        totalPence: { point: number };
        energyPence: { point: number };
        chargesPence: number;
        charges: unknown[];
        co2Kg?: number;
      }>;
    };
    expect(b.roundTrip).toBe(true);
    expect(b.distanceMeters).toBe(a.distanceMeters * 2);
    expect(b.durationSeconds).toBe(a.durationSeconds * 2);
    expect(b.hmrc.passengerPence).toBeGreaterThan(0);
    expect(b.alternatives.length).toBeGreaterThan(0);
    expect(b.alternatives[0]?.totalPence.point).toBe(
      (b.alternatives[0]?.energyPence.point ?? 0) + (b.alternatives[0]?.chargesPence ?? 0),
    );
  });

  it('forwards vehicle options on from-maps-url, warns on walking links, and blocks SSRF short-URL redirects', async () => {
    const { expandMapsShortUrl } = await import('@locations/api/brim/estimate');
    const blocked = await expandMapsShortUrl(
      testEnv({ BRIM_FIXTURES: '0' }),
      'https://evil.example.com/short',
      async () => new Response(null, { status: 302, headers: { Location: 'http://169.254.169.254/latest' } }),
    );
    expect(blocked).toBeNull();

    const blockedHop = await expandMapsShortUrl(
      testEnv({ BRIM_FIXTURES: '0' }),
      'https://maps.app.goo.gl/abc123',
      async () => new Response(null, { status: 302, headers: { Location: 'https://169.254.169.254/latest' } }),
    );
    expect(blockedHop).toBeNull();

    const allowedHop = await expandMapsShortUrl(
      testEnv({ BRIM_FIXTURES: '0' }),
      'https://maps.app.goo.gl/abc123',
      async () =>
        new Response(null, {
          status: 302,
          headers: { Location: 'https://www.google.com/maps/dir/Crawley/London' },
        }),
    );
    expect(allowedHop).toBe('https://www.google.com/maps/dir/Crawley/London');

    const mapsRes = await app.request(
      '/api/brim/estimate/from-maps-url',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://www.google.com/maps/dir/?api=1&origin=Crawley&destination=London&travelmode=walking',
          propulsion: 'bev',
          vehicleInline: {
            kind: 'car',
            propulsion: 'bev',
            userEnteredConsumption: 4,
            userEnteredUnit: 'mi/kWh',
            batteryKwhUsable: 60,
            startChargePercent: 80,
          },
        }),
      },
      fixtures,
    );
    expect(mapsRes.status).toBe(200);
    const mapsBody = (await mapsRes.json()) as {
      consumption: { tier: number };
      warnings: Array<{ code: string; severity: string }>;
    };
    expect(mapsBody.consumption.tier).toBe(1);
    expect(
      mapsBody.warnings.some((w) => w.code === 'non-driving-maps-url' && w.severity === 'info'),
    ).toBe(true);
  });
});
