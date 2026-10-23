import { describe, expect, it } from 'vitest';
import { intensityFromFixtures, resolveEstimateEvPrice, resolveForecastTemp } from "@locations/api/brim/ev";

describe('resolveEstimateEvPrice', () => {
  it('uses the dated home fallback instead of national-median', () => {
    const resolved = resolveEstimateEvPrice({});
    expect(resolved.source).toBe('hardcoded-fallback');
    expect(resolved.pence).toBe(7.5);
    expect(resolved.warning?.code).toBe('price-data-unavailable');
  });

  it('prefers the saved off-peak home rate', () => {
    const resolved = resolveEstimateEvPrice({
      tariff: {
        id: 't1',
        vehicle_id: 'v1',
        kind: 'home',
        pence_per_kwh: 28,
        offpeak_pence: 7.5,
        offpeak_window: '00:30-05:30',
        is_default: true,
      },
    });
    expect(resolved.source).toBe('user-tariff');
    expect(resolved.pence).toBe(7.5);
    expect(resolved.charging).toBe('acHome');
  });

  it('uses the public network table', () => {
    const resolved = resolveEstimateEvPrice({
      chargingLocation: 'public',
      network: 'ionity',
      chargingSpeed: 'dc',
    });
    expect(resolved.source).toBe('network-table');
    expect(resolved.pence).toBe(74);
    expect(resolved.charging).toBe('dcRapid');
  });
});

describe('intensityFromFixtures', () => {
  it('picks the half-hour at leave time', async () => {
    const hit = await intensityFromFixtures('2026-08-16T12:00:00Z', '1');
    expect(hit.gPerKwh).toBe(190);
    expect(hit.reason).toMatch(/190 g\/kWh/);
  });

  it('falls back to 150 with a reason when the window is missing', async () => {
    const miss = await intensityFromFixtures('1970-01-01T00:00:00Z', '1');
    expect(miss.gPerKwh).toBe(150);
    expect(miss.reason).toMatch(/150 g\/kWh/);
  });
});

describe('resolveForecastTemp', () => {
  it('returns 12C in fixture mode without fetching', async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error('Open-Meteo must not be called in fixture mode');
    };
    const temp = await resolveForecastTemp({
      fixtureMode: true,
      origin: { lat: 51.11, lng: -0.186 },
      atIso: '2026-08-16T12:00:00Z',
      fetchImpl,
    });
    expect(temp).toBe(12);
  });

  it('skips when origin has no coordinates', async () => {
    const temp = await resolveForecastTemp({
      fixtureMode: false,
      atIso: '2026-08-16T12:00:00Z',
      fetchImpl: async () => {
        throw new Error('should not fetch');
      },
    });
    expect(temp).toBeUndefined();
  });
});
