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

describe('charges API', () => {
  it('lists public zones with verified_on', async () => {
    const res = await app.request('/api/brim/zones', {}, env);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      zones: Array<{ id: string; verifiedOn: string }>;
      tolls: Array<{ id: string }>;
    };
    expect(json.zones.some((z) => z.id === 'london-ulez')).toBe(true);
    expect(json.zones.some((z) => z.id === 'birmingham-caz')).toBe(true);
    expect(json.zones.some((z) => z.id === 'glasgow-lez')).toBe(true);
    expect(json.tolls.some((t) => t.id === 'dart-charge')).toBe(true);
    expect(json.tolls.some((t) => t.id === 'm6-toll')).toBe(true);
    expect(json.zones.every((z) => z.verifiedOn.length === 10)).toBe(true);
  });

  it('puts ULEZ and CC on Crawley to London in weekday hours', async () => {
    const res = await app.request(
      '/api/brim/estimate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: 'Crawley',
          destination: 'London',
          departsAt: '2026-08-14T08:00:00Z',
          propulsion: 'diesel',
          vehicleInline: {
            kind: 'car',
            propulsion: 'diesel',
            euroStatus: 'Euro 5',
            euroStatusSource: 'derived',
            userEnteredConsumption: 40,
            userEnteredUnit: 'mpg',
          },
        }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      charges: Array<{ id: string; pence: number }>;
      cost: { chargesPence: number };
      encodedPolyline: string;
    };
    expect(json.charges.some((c) => c.id.startsWith('london-ulez') && c.pence === 1250)).toBe(true);
    expect(json.charges.some((c) => c.id.startsWith('london-cc') && c.pence === 1800)).toBe(true);
    expect(json.cost.chargesPence).toBe(3050);

    const forRoute = await app.request(
      '/api/brim/charges/for-route',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          polyline: json.encodedPolyline,
          departsAt: '2026-08-14T08:00:00Z',
          vehicleInline: { kind: 'car', propulsion: 'diesel', euroStatus: 'Euro 5' },
        }),
      },
      env,
    );
    expect(forRoute.status).toBe(200);
    const routed = (await forRoute.json()) as { charges: Array<{ id: string }> };
    expect(routed.charges.some((c) => c.id.startsWith('london-ulez'))).toBe(true);
  });

  it('does not put a pound figure on Glasgow LEZ', async () => {
    const res = await app.request(
      '/api/brim/estimate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: 'Edinburgh',
          destination: 'Glasgow',
          departsAt: '2026-08-14T08:00:00Z',
          vehicleInline: {
            kind: 'car',
            propulsion: 'diesel',
            euroStatus: 'Euro 5',
            euroStatusSource: 'derived',
          },
        }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      charges: Array<{ kind: string; pence: number }>;
      warnings: Array<{ code: string }>;
    };
    expect(json.charges.some((c) => c.kind === 'restriction' && c.pence === 0)).toBe(true);
    expect(json.warnings.some((w) => w.code === 'restriction')).toBe(true);
  });

  it('returns simplified GeoJSON geometry on GET /api/brim/zones?geometry=1 and compliance per vehicle', async () => {
    resetBrimMemory();
    const res = await app.request('/api/brim/zones?geometry=1', {}, env);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      zones: Array<{ id: string; geometry?: { type: string; coordinates: unknown[] } }>;
      tolls: Array<{ id: string; geometry?: { type: string; coordinates: unknown[] } }>;
    };
    expect(json.zones).toHaveLength(13);
    expect(json.tolls).toHaveLength(10);
    expect(json.zones.every((z) => Boolean(z.geometry?.type))).toBe(true);
    expect(json.tolls.every((t) => Boolean(t.geometry?.type))).toBe(true);

    const created = await app.request(
      '/api/brim/vehicles',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nickname: 'Euro 5 Diesel',
          kind: 'car',
          propulsion: 'diesel',
          euroStatus: 'Euro 5',
          euroStatusSource: 'dvla',
        }),
      },
      env,
    );
    expect(created.status).toBe(201);
    const car = (await created.json()) as { id: string };

    const comp = await app.request(`/api/brim/vehicles/${car.id}/compliance`, {}, env);
    expect(comp.status).toBe(200);
    const compBody = (await comp.json()) as {
      vehicleId: string;
      zones: Array<{ id: string; verdict: string; caveat?: string }>;
    };
    expect(compBody.vehicleId).toBe(car.id);
    expect(compBody.zones).toHaveLength(13);
    expect(compBody.zones.find((z) => z.id === 'london-ulez')?.verdict).toBe('charged');
    expect(compBody.zones.find((z) => z.id === 'london-ulez')?.caveat).toBeUndefined();

    getSession.mockImplementation(async () => sessionUser({ id: 'user-b', email: 'b@example.com' }));
    const other = await app.request(`/api/brim/vehicles/${car.id}/compliance`, {}, env);
    expect(other.status).toBe(404);
  });
});
