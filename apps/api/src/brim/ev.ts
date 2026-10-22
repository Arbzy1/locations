import { sql } from 'drizzle-orm';
import {
  CARBON_INTENSITY_REGION,
  EV_NETWORK_TABLE,
  FIXTURE_FORECAST_TEMP_C,
  GRID_INTENSITY_FALLBACK_G,
  gridIntensityReason,
  isFixtureMode,
  loadFixture,
  openMeteoForecastUrl,
  pickGridIntensity,
  pickHourlyTemperature,
  resolveEvPrice,
  type CarbonIntensityPeriod,
  type ChargingLocation,
  type ChargingSpeed,
  type ResolvedEvPrice,
} from '@locations/brim/shared';
import type { Context } from 'hono';
import type { BrimDb } from './db/types';
import { withRls } from './db/with-rls';
import type { TariffRow } from './db/rows';
import { persistLive, type BrimContext } from "./context";
import type { Env } from "../env";

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === 'object' && 'rows' in result) return (result as { rows: T[] }).rows;
  return [];
}

function asNumber(value: number | string | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function asIso(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : value;
}

export function resolveEstimateEvPrice(input: {
  chargingLocation?: ChargingLocation;
  network?: string;
  chargingSpeed?: ChargingSpeed;
  pricePence?: number;
  offpeakPence?: number;
  offpeakWindow?: string;
  tariff?: TariffRow;
}): ResolvedEvPrice {
  return resolveEvPrice({
    ...(input.chargingLocation ? { chargingLocation: input.chargingLocation } : {}),
    ...(input.network ? { network: input.network } : {}),
    ...(input.chargingSpeed ? { chargingSpeed: input.chargingSpeed } : {}),
    ...(input.pricePence !== undefined ? { pricePence: input.pricePence } : {}),
    ...(input.offpeakPence !== undefined ? { offpeakPence: input.offpeakPence } : {}),
    ...(input.offpeakWindow ? { offpeakWindow: input.offpeakWindow } : {}),
    ...(input.tariff
      ? {
          peakPence: input.tariff.pence_per_kwh,
          ...(input.tariff.offpeak_pence !== undefined && input.offpeakPence === undefined
            ? { offpeakPence: input.tariff.offpeak_pence }
            : {}),
          ...(input.tariff.offpeak_window && !input.offpeakWindow
            ? { offpeakWindow: input.tariff.offpeak_window }
            : {}),
        }
      : {}),
  });
}

export function intensityFromFixtures(
  atIso: string,
  flag: string | undefined,
): { gPerKwh: number; reason: string } {
  const rows = loadFixture<CarbonIntensityPeriod[]>('carbon-intensity', flag);
  const hit = pickGridIntensity(rows, atIso);
  return {
    gPerKwh: hit?.intensityGPerKwh ?? GRID_INTENSITY_FALLBACK_G,
    reason: gridIntensityReason(hit),
  };
}

export async function loadGridIntensity(
  env: Env,
  db: BrimDb,
  atIso: string,
): Promise<{ gPerKwh: number; reason: string }> {
  if (isFixtureMode(env.BRIM_FIXTURES)) {
    return intensityFromFixtures(atIso, env.BRIM_FIXTURES);
  }
  if (!persistLive(db)) {
    return {
      gPerKwh: GRID_INTENSITY_FALLBACK_G,
      reason: gridIntensityReason(undefined),
    };
  }
  const hit = await withRls(db, { shared: true }, async (tx) => {
    const result = await tx.execute(sql`
      SELECT region, intensity_g_per_kwh, valid_from, valid_to
      FROM brim_grid_intensity
      WHERE region = ${CARBON_INTENSITY_REGION}
        AND valid_from <= ${atIso}::timestamptz
        AND valid_to > ${atIso}::timestamptz
      LIMIT 1
    `);
    const row = rowsOf<{
      region: string;
      intensity_g_per_kwh: number | string;
      valid_from: Date | string;
      valid_to: Date | string;
    }>(result)[0];
    const g = asNumber(row?.intensity_g_per_kwh);
    const from = asIso(row?.valid_from);
    const to = asIso(row?.valid_to);
    if (g === undefined || !from || !to) return undefined;
    return {
      region: row?.region ?? CARBON_INTENSITY_REGION,
      intensityGPerKwh: g,
      validFrom: from,
      validTo: to,
      source: 'forecast' as const,
    };
  });
  return {
    gPerKwh: hit?.intensityGPerKwh ?? GRID_INTENSITY_FALLBACK_G,
    reason: gridIntensityReason(hit),
  };
}

export async function resolveForecastTemp(input: {
  fixtureMode: boolean;
  origin?: { lat: number; lng: number };
  atIso: string;
  fetchImpl?: typeof fetch;
}): Promise<number | undefined> {
  if (!input.origin) return undefined;
  if (input.fixtureMode) return FIXTURE_FORECAST_TEMP_C;
  const fetchImpl = input.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(openMeteoForecastUrl(input.origin.lat, input.origin.lng, input.atIso));
    if (!res.ok) return undefined;
    const json: unknown = await res.json();
    return pickHourlyTemperature(json, input.atIso);
  } catch {
    return undefined;
  }
}

export function handleMetaEvTariffs(c: BrimContext) {
  return c.json(EV_NETWORK_TABLE);
}
