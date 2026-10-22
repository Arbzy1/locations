import { z } from 'zod';
import {
  DEFAULT_MAX_PERPENDICULAR_METERS,
  litresToFill,
  pencePerKmFromConsumption,
  rankCheapestFill,
} from '@locations/brim/engine';
import {
  decodePolyline,
  gradeForPropulsion,
  isFixtureMode,
  mpgToL100km,
  openingHoursSummary,
  simplifyRdp,
  type FuelGrade,
  type LatLng,
  type Propulsion,
  type VehicleProfile,
} from '@locations/brim/shared';
import type { Context } from 'hono';
import {
  decorateNearby,
  fixtureAlongRoute,
  fixtureCorpus,
  liveAlongRoute,
  resolveEstimateFillBaseline,
  type NearStation,
} from './prices';
import type { BrimDb } from './db/types';
import { createDb, persistLive, type BrimContext } from "./context";
import type { Env } from "../env";

const MAX_DETOUR_KM = 10;

export type CheapestFillStation = {
  stationId: string;
  name: string;
  lat: number;
  lng: number;
  pence: number;
  observedAt: string;
  fillPence: number;
  detourKm: number;
  detourPence: number;
  totalPence: number;
  savingPence: number;
  perpendicularMeters: number;
  brand?: string;
  openingHours?: string;
};

export type CheapestFillPayload = {
  baseline: {
    pencePerLitre: number;
    source: 'home-area-median' | 'national-median';
    label: string;
  };
  litresToFill: number;
  reasons: string[];
  stations: CheapestFillStation[];
};

function toWkt(points: LatLng[]): string {
  const simplified = simplifyRdp(points, 0.0003);
  const seq = simplified.map((p) => `${p.lng} ${p.lat}`).join(', ');
  return `LINESTRING(${seq})`;
}

function parseGrade(raw: string | undefined): FuelGrade | undefined {
  if (raw === 'E10' || raw === 'E5' || raw === 'B7' || raw === 'SDV' || raw === 'LPG') return raw;
  return undefined;
}

function baselineLabel(source: 'home-area-median' | 'national-median'): string {
  return source === 'home-area-median' ? 'near home' : 'at the national median';
}

function radiusMeters(maxDetourKm: number | undefined): number {
  const km = maxDetourKm !== undefined && maxDetourKm > 0 ? maxDetourKm : DEFAULT_MAX_PERPENDICULAR_METERS / 1000;
  return Math.min(km, MAX_DETOUR_KM) * 1000;
}

async function corridorStations(
  env: Env,
  db: BrimDb,
  points: LatLng[],
  grade: FuelGrade,
  maxPerpendicularMeters: number,
): Promise<NearStation[]> {
  if (isFixtureMode(env.BRIM_FIXTURES)) {
    const corpus = fixtureCorpus(env.BRIM_FIXTURES);
    const hits = fixtureAlongRoute(corpus.observations, points, maxPerpendicularMeters, grade);
    return decorateNearby(hits, corpus.stations);
  }
  if (!persistLive(db)) return [];
  return liveAlongRoute(db, {
    wkt: toWkt(points),
    radiusMeters: maxPerpendicularMeters,
    grade,
  });
}

function resolvePencePerKm(input: {
  pencePerKm?: number;
  lPer100km?: number;
  mpg?: number;
  baselinePence: number;
}): number {
  if (input.pencePerKm !== undefined && input.pencePerKm > 0) return input.pencePerKm;
  const ppl = input.baselinePence;
  if (input.lPer100km !== undefined && input.lPer100km > 0) {
    return pencePerKmFromConsumption(input.lPer100km, ppl);
  }
  if (input.mpg !== undefined && input.mpg > 0) {
    return pencePerKmFromConsumption(mpgToL100km(input.mpg), ppl);
  }
  return pencePerKmFromConsumption(7, ppl);
}

export async function rankCheapestFillForRoute(
  env: Env,
  db: BrimDb,
  input: {
    polyline: string | LatLng[];
    grade: FuelGrade;
    origin?: { lat: number; lng: number };
    propulsion?: Propulsion;
    maxDetourKm?: number;
    tankLitres?: number;
    remainingLitres?: number;
    pencePerKm?: number;
    lPer100km?: number;
    mpg?: number;
    detourPricePence?: number;
  },
): Promise<CheapestFillPayload | undefined> {
  const points = typeof input.polyline === 'string' ? decodePolyline(input.polyline) : input.polyline;
  if (points.length < 2) return undefined;
  const origin = input.origin ?? points[0];
  const propulsion = input.propulsion ?? (input.grade === 'B7' ? 'diesel' : 'petrol');
  const baseline = await resolveEstimateFillBaseline(env, db, {
    propulsion,
    ...(origin ? { origin } : {}),
  });
  if (!baseline || (baseline.source !== 'home-area-median' && baseline.source !== 'national-median')) {
    return undefined;
  }
  const litres = litresToFill(input.tankLitres, input.remainingLitres);
  const maxPerp = radiusMeters(input.maxDetourKm);
  const corridor = await corridorStations(env, db, points, input.grade, maxPerp);
  const ranked = rankCheapestFill({
    candidates: corridor.flatMap((row) => {
      if (row.pence === undefined || !(row.pence > 0)) return [];
      return [{ stationId: row.id, lat: row.lat, lng: row.lng, pencePerLitre: row.pence }];
    }),
    polyline: points,
    litresToFill: litres,
    pencePerKm: resolvePencePerKm({
      baselinePence: input.detourPricePence ?? baseline.pence,
      ...(input.pencePerKm !== undefined ? { pencePerKm: input.pencePerKm } : {}),
      ...(input.lPer100km !== undefined ? { lPer100km: input.lPer100km } : {}),
      ...(input.mpg !== undefined ? { mpg: input.mpg } : {}),
    }),
    baselinePencePerLitre: baseline.pence,
    maxPerpendicularMeters: maxPerp,
  });
  if (ranked.stations.length === 0) return undefined;
  const byId = new Map(corridor.map((row) => [row.id, row]));
  const stations: CheapestFillStation[] = ranked.stations.flatMap((row) => {
    const meta = byId.get(row.stationId);
    if (!meta || meta.pence === undefined || !meta.observedAt) return [];
    const station: CheapestFillStation = {
      stationId: row.stationId,
      name: meta.name,
      lat: meta.lat,
      lng: meta.lng,
      pence: meta.pence,
      observedAt: meta.observedAt,
      fillPence: row.fillPence,
      detourKm: row.detourKm,
      detourPence: row.detourPence,
      totalPence: row.totalPence,
      savingPence: row.savingPence,
      perpendicularMeters: row.perpendicularMeters,
    };
    if (meta.brand) station.brand = meta.brand;
    const hours = openingHoursSummary(meta.openingHoursJson);
    if (hours) station.openingHours = hours;
    return [station];
  });
  if (stations.length === 0) return undefined;
  return {
    baseline: {
      pencePerLitre: baseline.pence,
      source: baseline.source,
      label: baselineLabel(baseline.source),
    },
    litresToFill: ranked.litresToFill,
    reasons: ranked.reasons,
    stations,
  };
}

export async function attachCheapestFill(input: {
  env: Env;
  db: BrimDb;
  propulsion: Propulsion;
  encodedPolyline: string;
  origin?: { lat: number; lng: number };
  vehicle?: VehicleProfile;
  lPer100km?: number;
}): Promise<CheapestFillPayload | undefined> {
  if (input.propulsion === 'bev') return undefined;
  const grade = gradeForPropulsion(input.propulsion);
  if (!grade) return undefined;
  return rankCheapestFillForRoute(input.env, input.db, {
    polyline: input.encodedPolyline,
    grade,
    propulsion: input.propulsion,
    ...(input.origin ? { origin: input.origin } : {}),
    ...(input.vehicle?.tankLitres !== undefined ? { tankLitres: input.vehicle.tankLitres } : {}),
    ...(input.lPer100km !== undefined ? { lPer100km: input.lPer100km } : {}),
  });
}

const nearRouteBody = z.object({
  polyline: z.string().min(1),
  grade: z.enum(['E10', 'E5', 'B7', 'SDV', 'LPG']),
  maxDetourKm: z.coerce.number().positive().optional(),
  tankLitres: z.coerce.number().positive().optional(),
  remainingLitres: z.coerce.number().min(0).optional(),
  pencePerKm: z.coerce.number().positive().optional(),
  mpg: z.coerce.number().positive().optional(),
  lPer100km: z.coerce.number().positive().optional(),
  pricePence: z.coerce.number().positive().optional(),
});

export async function handleStationsNearRoute(c: BrimContext) {
  const db = createDb(c.env);
  const raw =
    c.req.method === 'GET'
      ? {
          polyline: c.req.query('polyline'),
          grade: c.req.query('grade'),
          maxDetourKm: c.req.query('maxDetourKm'),
          tankLitres: c.req.query('tankLitres'),
          remainingLitres: c.req.query('remainingLitres'),
          pencePerKm: c.req.query('pencePerKm'),
          mpg: c.req.query('mpg'),
          lPer100km: c.req.query('lPer100km'),
          pricePence: c.req.query('pricePence'),
        }
      : await c.req.json();
  const parsed = nearRouteBody.safeParse(raw);
  if (!parsed.success) return c.json({ error: 'invalid_request', details: parsed.error.flatten() }, 400);
  const body = parsed.data;
  const grade = parseGrade(body.grade);
  if (!grade) return c.json({ error: 'invalid_request', reason: 'grade is required' }, 400);
  const ranked = await rankCheapestFillForRoute(c.env, db, {
    polyline: body.polyline,
    grade,
    ...(body.maxDetourKm !== undefined ? { maxDetourKm: body.maxDetourKm } : {}),
    ...(body.tankLitres !== undefined ? { tankLitres: body.tankLitres } : {}),
    ...(body.remainingLitres !== undefined ? { remainingLitres: body.remainingLitres } : {}),
    ...(body.pencePerKm !== undefined ? { pencePerKm: body.pencePerKm } : {}),
    ...(body.mpg !== undefined ? { mpg: body.mpg } : {}),
    ...(body.lPer100km !== undefined ? { lPer100km: body.lPer100km } : {}),
    ...(body.pricePence !== undefined ? { detourPricePence: body.pricePence } : {}),
  });
  return c.json(
    ranked ?? {
      baseline: null,
      litresToFill: litresToFill(body.tankLitres, body.remainingLitres),
      reasons: [],
      stations: [],
    },
  );
}
