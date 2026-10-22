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

const FIXTURE_KEY = 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE';

describe('vehicles resolve', () => {
  beforeEach(() => {
    resetBrimMemory();
  });

  it('joins a unique fixture plate without echoing the VRM', async () => {
    const res = await app.request(
      '/api/brim/vehicles/resolve',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vrm: 'ab12 cde' }),
      },
      { BRIM_FIXTURES: '1' },
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      outcome: string;
      ves: { make: string; euroStatus?: string; year?: number };
      candidates: Array<{ id: string }>;
    };
    expect(json.outcome).toBe('single');
    expect(json.candidates[0]?.id).toBe('vca_vw_golf_15_tsi');
    expect(json.ves.euroStatus).toBe('EURO 6');
    expect(json.ves.year).toBe(2021);
    expect(JSON.stringify(json)).not.toMatch(/AB12CDE/i);
  });

  it('returns a few Ford matches', async () => {
    const res = await app.request(
      '/api/brim/vehicles/resolve',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vrm: 'XY98ZAB' }),
      },
      { BRIM_FIXTURES: '1' },
    );
    const json = (await res.json()) as { outcome: string; candidates: Array<{ id: string }> };
    expect(json.outcome).toBe('few');
    expect(json.candidates).toHaveLength(2);
  });

  it('keeps euro when the join is empty', async () => {
    const res = await app.request(
      '/api/brim/vehicles/resolve',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vrm: 'ZZ99ZZZ' }),
      },
      { BRIM_FIXTURES: '1' },
    );
    const json = (await res.json()) as {
      outcome: string;
      ves: { euroStatus?: string };
      candidates: unknown[];
    };
    expect(json.outcome).toBe('none');
    expect(json.candidates).toEqual([]);
    expect(json.ves.euroStatus).toBe('EURO 5');
  });

  it('returns 404 for an unknown well-formed plate and 400 for junk', async () => {
    const missing = await app.request(
      '/api/brim/vehicles/resolve',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vrm: 'AA00AAA' }),
      },
      { BRIM_FIXTURES: '1' },
    );
    expect(missing.status).toBe(404);
    const bad = await app.request(
      '/api/brim/vehicles/resolve',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vrm: 'NOPE' }),
      },
      { BRIM_FIXTURES: '1' },
    );
    expect(bad.status).toBe(400);
  });

  it('returns 503 when DVLA_VES_API_KEY is missing outside fixture mode', async () => {
    const res = await app.request(
      '/api/brim/vehicles/resolve',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vrm: 'AB12CDE' }),
      },
      {},
    );
    expect(res.status).toBe(503);
    const json = (await res.json()) as { error: string; reason?: string };
    expect(json.error).toBe('dvla_unavailable');
    expect(json.reason).toMatch(/DVLA_VES_API_KEY/);
    expect(JSON.stringify(json)).not.toMatch(/AB12CDE/i);
  });

  it('does not persist a VRM when no encryption key is configured', async () => {
    const created = await app.request(
      '/api/brim/vehicles',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: 'Keyless golf', kind: 'car', propulsion: 'petrol', vrm: 'AB12CDE' }),
      },
      { BRIM_FIXTURES: '1' },
    );
    expect(created.status).toBe(201);
    const json = (await created.json()) as Record<string, unknown>;
    expect(json.vrm_hash).toBeUndefined();
    expect(json.vrm_encrypted).toBeUndefined();
    const stored = [...brimMemory().vehicles.values()][0];
    expect(stored?.vrm_encrypted).toBeUndefined();
  });

  it('encrypts a VRM at rest and returns plaintext only to the owning tenant', async () => {
    const env = { BRIM_FIXTURES: '1', VRM_ENCRYPTION_KEY: FIXTURE_KEY };
    const created = await app.request(
      '/api/brim/vehicles',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: 'Saved golf', kind: 'car', propulsion: 'petrol', vrm: 'AB12CDE' }),
      },
      env,
    );
    expect(created.status).toBe(201);
    const body = (await created.json()) as Record<string, unknown>;
    expect(body.vrm).toBe('AB12CDE');
    expect(body.vrm_hash).toBeUndefined();
    expect(body.vrm_encrypted).toBeUndefined();
    const stored = [...brimMemory().vehicles.values()].find((v) => v.nickname === 'Saved golf');
    expect(stored?.tenant).toBe('user-a');
    expect(stored?.vrm_hash).toBeTruthy();
    expect(stored?.vrm_encrypted?.startsWith('v1:')).toBe(true);
    expect(stored?.vrm_encrypted).not.toMatch(/AB12CDE/i);

    const listed = await app.request('/api/brim/vehicles', {}, env);
    const json = (await listed.json()) as { vehicles: Array<Record<string, unknown>> };
    expect(json.vehicles[0]?.vrm).toBe('AB12CDE');

    getSession.mockImplementation(async () => sessionUser({ id: 'user-b', email: 'b@example.com' }));
    const other = await app.request('/api/brim/vehicles', {}, env);
    expect(((await other.json()) as { vehicles: unknown[] }).vehicles).toEqual([]);
  });
});
