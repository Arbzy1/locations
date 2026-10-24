import { sql } from 'drizzle-orm';
import {
  HOME_AREA_METERS,
  distanceMeters,
  gradeForPropulsion,
  isFixtureMode,
  loadFixture,
  median,
  newestIso,
  normaliseFuelFinder,
  observationsFromNormalised,
  observationsNearPolyline,
  resolveFillBaseline,
  resolveIcePrice,
  tenthsToPpl,
  titleCaseAddress,
  type FuelFinderPfs,
  type FuelFinderPriceRow,
  type FuelGrade,
  type LatLng,
  type PriceObservation,
  type Propulsion,
  type ResolvedFuelPrice,
} from '@locations/brim/shared';
import type { BrimDb } from './db/types';
import { withRls } from './db/with-rls';
import { persistLive } from "./context";
import type { Env } from "../env";

export type NearStation = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  distanceMeters: number;
  brand?: string;
  address?: string;
  postcode?: string;
  grade?: FuelGrade;
  pence?: number;
  observedAt?: string;
  openingHoursJson?: unknown;
};

type MedianRow = { median_tenths: number | string | null; observed_at: Date | string | null };

const NEAR_CAP = 40;
const MAX_RADIUS_KM = 50;

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

export async function fixtureCorpus(flag: string | undefined) {
  const raw = await loadFixture<{ pfs: FuelFinderPfs[]; prices: FuelFinderPriceRow[]; nowIso?: string }>(
    'fuel-finder',
    flag,
  );
  const result = normaliseFuelFinder({
    pfs: raw.pfs,
    prices: raw.prices,
    nowIso: raw.nowIso ?? new Date().toISOString(),
  });
  return {
    ...result,
    observations: observationsFromNormalised(result.stations, result.prices),
  };
}

export function nearbyFromObservations(
  observations: PriceObservation[],
  input: { lat: number; lng: number; radiusMeters: number; grade?: FuelGrade; cap?: number },
): NearStation[] {
  const origin = { lat: input.lat, lng: input.lng };
  const cap = input.cap ?? NEAR_CAP;
  const seen = new Set<string>();
  const hits: NearStation[] = [];
  const ranked = observations
    .filter((row) => !row.isStale && (!input.grade || row.grade === input.grade))
    .map((row) => ({ row, distance: distanceMeters(origin, row) }))
    .filter((item) => item.distance <= input.radiusMeters)
    .sort((a, b) => a.distance - b.distance);

  for (const item of ranked) {
    if (seen.has(item.row.stationId)) continue;
    seen.add(item.row.stationId);
    const station: NearStation = {
      id: item.row.stationId,
      name: item.row.stationId,
      lat: item.row.lat,
      lng: item.row.lng,
      distanceMeters: Math.round(item.distance),
      grade: item.row.grade,
      pence: tenthsToPpl(item.row.priceTenthsPence),
      observedAt: item.row.observedAt,
    };
    hits.push(station);
    if (hits.length >= cap) break;
  }
  return hits;
}

export function decorateNearby(
  hits: NearStation[],
  stations: Array<{
    id: string;
    name: string;
    brandCanonical: string;
    address?: string;
    postcode?: string;
    openingHoursJson?: unknown;
  }>,
): NearStation[] {
  const byId = new Map(stations.map((s) => [s.id, s]));
  return hits.map((hit) => {
    const station = byId.get(hit.id);
    if (!station) return hit;
    const next: NearStation = { ...hit, name: station.name, brand: station.brandCanonical };
    if (station.address) next.address = titleCaseAddress(station.address);
    if (station.postcode) next.postcode = station.postcode;
    if (station.openingHoursJson !== undefined) next.openingHoursJson = station.openingHoursJson;
    return next;
  });
}

export function nationalMediansFromObservations(observations: PriceObservation[]) {
  const grades: FuelGrade[] = ['E10', 'E5', 'B7', 'SDV', 'LPG'];
  const out: Record<string, { pence: number; observedAt: string; sampleCount: number }> = {};
  for (const grade of grades) {
    const rows = observations.filter((row) => row.grade === grade && !row.isStale);
    const tenths = median(rows.map((r) => r.priceTenthsPence));
    const observedAt = newestIso(rows.map((r) => r.observedAt));
    if (tenths === undefined || !observedAt) continue;
    out[grade] = { pence: tenthsToPpl(tenths), observedAt, sampleCount: rows.length };
  }
  return out;
}

function parseGrade(raw: string | undefined): FuelGrade | undefined {
  if (raw === 'E10' || raw === 'E5' || raw === 'B7' || raw === 'SDV' || raw === 'LPG') return raw;
  return undefined;
}

export function radiusMetersFromQuery(raw: string | undefined): number {
  if (!raw) return HOME_AREA_METERS;
  const km = Number(raw);
  if (!Number.isFinite(km) || km <= 0) return HOME_AREA_METERS;
  return Math.min(km, MAX_RADIUS_KM) * 1000;
}

export async function resolveEstimatePrice(
  env: Env,
  db: BrimDb,
  input: {
    propulsion: Propulsion;
    stationId?: string;
    origin?: { lat: number; lng: number };
  },
): Promise<ResolvedFuelPrice | undefined> {
  const grade = gradeForPropulsion(input.propulsion);
  if (!grade) return undefined;
  if (isFixtureMode(env.BRIM_FIXTURES)) {
    const corpus = await fixtureCorpus(env.BRIM_FIXTURES);
    const resolved = resolveIcePrice({
      grade,
      observations: corpus.observations,
      ...(input.stationId ? { stationId: input.stationId } : {}),
      ...(input.origin ? { origin: input.origin } : {}),
    });
    return resolved;
  }
  if (!persistLive(db)) {
    return resolveIcePrice({ grade, observations: [] });
  }
  return resolveLivePrice(db, {
    grade,
    ...(input.stationId ? { stationId: input.stationId } : {}),
    ...(input.origin ? { origin: input.origin } : {}),
  });
}

async function resolveLivePrice(
  db: BrimDb,
  input: { grade: FuelGrade; stationId?: string; origin?: { lat: number; lng: number } },
): Promise<ResolvedFuelPrice> {
  if (input.stationId) {
    const picked = await stationPrice(db, input.stationId, input.grade);
    if (picked) return picked;
  }
  if (input.origin) {
    const area = await medianWithin(db, input.grade, input.origin, HOME_AREA_METERS, 'home-area-median');
    if (area) return area;
  }
  const national = await medianWithin(db, input.grade, undefined, undefined, 'national-median');
  if (national) return national;
  return resolveIcePrice({ grade: input.grade, observations: [] });
}

async function stationPrice(db: BrimDb, stationId: string, grade: FuelGrade): Promise<ResolvedFuelPrice | undefined> {
  return withRls(db, { shared: true }, async (tx) => {
    const result = await tx.execute(sql`
      SELECT sp.price_tenths_pence, sp.observed_at
      FROM brim_station_prices sp
      JOIN brim_stations s ON s.id = sp.station_id
      WHERE sp.station_id = ${stationId}
        AND sp.grade = ${grade}
        AND s.is_stale = false
      LIMIT 1
    `);
    const row = rowsOf<{ price_tenths_pence: number | string; observed_at: Date | string }>(result)[0];
    const tenths = asNumber(row?.price_tenths_pence);
    const observedAt = asIso(row?.observed_at);
    if (tenths === undefined || !observedAt) return undefined;
    return {
      pence: tenthsToPpl(tenths),
      source: 'user-picked-station',
      observedAt,
      stationId,
      reason: `Used the ${grade} price at the forecourt you picked.`,
    };
  });
}

async function medianWithin(
  db: BrimDb,
  grade: FuelGrade,
  origin: { lat: number; lng: number } | undefined,
  radiusMeters: number | undefined,
  source: 'home-area-median' | 'national-median',
): Promise<ResolvedFuelPrice | undefined> {
  return withRls(db, { shared: true }, async (tx) => {
    const geo =
      origin && radiusMeters !== undefined
        ? sql`AND ST_DWithin(
            s.location,
            ST_SetSRID(ST_MakePoint(${origin.lng}::float8, ${origin.lat}::float8), 4326)::geography,
            ${radiusMeters}
          )`
        : sql``;
    const result = await tx.execute(sql`
      SELECT
        percentile_cont(0.5) WITHIN GROUP (ORDER BY sp.price_tenths_pence) AS median_tenths,
        MAX(sp.observed_at) AS observed_at
      FROM brim_station_prices sp
      JOIN brim_stations s ON s.id = sp.station_id
      WHERE sp.grade = ${grade}
        AND s.is_stale = false
        ${geo}
    `);
    const row = rowsOf<MedianRow>(result)[0];
    const tenths = asNumber(row?.median_tenths);
    const observedAt = asIso(row?.observed_at);
    if (tenths === undefined || !observedAt) return undefined;
    return {
      pence: tenthsToPpl(tenths),
      source,
      observedAt,
      reason:
        source === 'home-area-median'
          ? `Used the median ${grade} price within 10 miles of the start.`
          : `Used the national median ${grade} price.`,
    };
  });
}

export async function liveNearby(
  db: BrimDb,
  input: { lat: number; lng: number; radiusMeters: number; grade?: FuelGrade },
): Promise<NearStation[]> {
  return withRls(db, { shared: true }, async (tx) => {
    const gradeFilter = input.grade ? sql`AND sp.grade = ${input.grade}` : sql``;
    const result = await tx.execute(sql`
      SELECT
        s.id,
        s.brand_canonical,
        s.name,
        s.address,
        s.postcode,
        ST_Y(s.location::geometry) AS lat,
        ST_X(s.location::geometry) AS lng,
        sp.grade,
        sp.price_tenths_pence,
        sp.observed_at,
        ST_Distance(
          s.location,
          ST_SetSRID(ST_MakePoint(${input.lng}::float8, ${input.lat}::float8), 4326)::geography
        ) AS distance_meters
      FROM brim_stations s
      JOIN brim_station_prices sp ON sp.station_id = s.id
      WHERE s.is_stale = false
        AND s.location IS NOT NULL
        AND ST_DWithin(
          s.location,
          ST_SetSRID(ST_MakePoint(${input.lng}::float8, ${input.lat}::float8), 4326)::geography,
          ${input.radiusMeters}
        )
        ${gradeFilter}
      ORDER BY distance_meters ASC
      LIMIT ${NEAR_CAP * 4}
    `);
    const rows = rowsOf<{
      id: string;
      brand_canonical: string | null;
      name: string;
      address: string | null;
      postcode: string | null;
      lat: number | string;
      lng: number | string;
      grade: string;
      price_tenths_pence: number | string;
      observed_at: Date | string;
      distance_meters: number | string;
    }>(result);
    const seen = new Set<string>();
    const hits: NearStation[] = [];
    for (const row of rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      const lat = asNumber(row.lat);
      const lng = asNumber(row.lng);
      if (lat === undefined || lng === undefined) continue;
      const station: NearStation = {
        id: row.id,
        name: row.name,
        lat,
        lng,
        distanceMeters: Math.round(asNumber(row.distance_meters) ?? 0),
      };
      if (row.brand_canonical) station.brand = row.brand_canonical;
      if (row.address) station.address = titleCaseAddress(row.address);
      if (row.postcode) station.postcode = row.postcode;
      const grade = parseGrade(row.grade);
      if (grade) station.grade = grade;
      const pence = asNumber(row.price_tenths_pence);
      if (pence !== undefined) station.pence = tenthsToPpl(pence);
      const observedAt = asIso(row.observed_at);
      if (observedAt) station.observedAt = observedAt;
      hits.push(station);
      if (hits.length >= NEAR_CAP) break;
    }
    return hits;
  });
}

export async function liveNationalMedians(db: BrimDb) {
  return withRls(db, { shared: true }, async (tx) => {
    const result = await tx.execute(sql`
      SELECT
        sp.grade,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY sp.price_tenths_pence) AS median_tenths,
        MAX(sp.observed_at) AS observed_at,
        COUNT(*)::int AS sample_count
      FROM brim_station_prices sp
      JOIN brim_stations s ON s.id = sp.station_id
      WHERE s.is_stale = false
      GROUP BY sp.grade
    `);
    const out: Record<string, { pence: number; observedAt: string; sampleCount: number }> = {};
    for (const row of rowsOf<{
      grade: string;
      median_tenths: number | string | null;
      observed_at: Date | string | null;
      sample_count: number | string;
    }>(result)) {
      const tenths = asNumber(row.median_tenths);
      const observedAt = asIso(row.observed_at);
      const sampleCount = asNumber(row.sample_count);
      if (tenths === undefined || !observedAt || sampleCount === undefined) continue;
      out[row.grade] = { pence: tenthsToPpl(tenths), observedAt, sampleCount };
    }
    return out;
  });
}

export function fixtureAlongRoute(
  observations: PriceObservation[],
  points: LatLng[],
  radiusMeters: number,
  grade: FuelGrade,
): NearStation[] {
  const hits = observationsNearPolyline(observations, points, radiusMeters, grade);
  return hits.flatMap((row) => {
    if (!(row.priceTenthsPence > 0)) return [];
    const station: NearStation = {
      id: row.stationId,
      name: row.stationId,
      lat: row.lat,
      lng: row.lng,
      distanceMeters: 0,
      grade: row.grade,
      pence: tenthsToPpl(row.priceTenthsPence),
      observedAt: row.observedAt,
    };
    return [station];
  });
}

export async function liveAlongRoute(
  db: BrimDb,
  input: { wkt: string; radiusMeters: number; grade: FuelGrade },
): Promise<NearStation[]> {
  return withRls(db, { shared: true }, async (tx) => {
    const result = await tx.execute(sql`
      SELECT
        s.id,
        s.brand_canonical,
        s.name,
        s.address,
        s.postcode,
        s.opening_hours_json,
        ST_Y(s.location::geometry) AS lat,
        ST_X(s.location::geometry) AS lng,
        sp.grade,
        sp.price_tenths_pence,
        sp.observed_at
      FROM brim_stations s
      JOIN brim_station_prices sp ON sp.station_id = s.id
      WHERE s.is_stale = false
        AND s.location IS NOT NULL
        AND sp.grade = ${input.grade}
        AND ST_DWithin(
          s.location,
          ST_GeomFromText(${input.wkt}, 4326)::geography,
          ${input.radiusMeters}
        )
      LIMIT 80
    `);
    const rows = rowsOf<{
      id: string;
      brand_canonical: string | null;
      name: string;
      address: string | null;
      postcode: string | null;
      opening_hours_json: unknown;
      lat: number | string;
      lng: number | string;
      grade: string;
      price_tenths_pence: number | string;
      observed_at: Date | string;
    }>(result);
    const seen = new Set<string>();
    const hits: NearStation[] = [];
    for (const row of rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      const lat = asNumber(row.lat);
      const lng = asNumber(row.lng);
      const pence = asNumber(row.price_tenths_pence);
      if (lat === undefined || lng === undefined || pence === undefined) continue;
      const station: NearStation = {
        id: row.id,
        name: row.name,
        lat,
        lng,
        distanceMeters: 0,
        pence: tenthsToPpl(pence),
      };
      if (row.brand_canonical) station.brand = row.brand_canonical;
      if (row.address) station.address = titleCaseAddress(row.address);
      if (row.postcode) station.postcode = row.postcode;
      if (row.opening_hours_json !== undefined && row.opening_hours_json !== null) {
        station.openingHoursJson = row.opening_hours_json;
      }
      const grade = parseGrade(row.grade);
      if (grade) station.grade = grade;
      const observedAt = asIso(row.observed_at);
      if (observedAt) station.observedAt = observedAt;
      hits.push(station);
    }
    return hits;
  });
}

export async function resolveEstimateFillBaseline(
  env: Env,
  db: BrimDb,
  input: { propulsion: Propulsion; origin?: { lat: number; lng: number } },
): Promise<ResolvedFuelPrice | undefined> {
  const grade = gradeForPropulsion(input.propulsion);
  if (!grade) return undefined;
  if (isFixtureMode(env.BRIM_FIXTURES)) {
    const corpus = await fixtureCorpus(env.BRIM_FIXTURES);
    return resolveFillBaseline({
      grade,
      observations: corpus.observations,
      ...(input.origin ? { origin: input.origin } : {}),
    });
  }
  if (!persistLive(db)) return undefined;
  if (input.origin) {
    const area = await medianWithin(db, grade, input.origin, HOME_AREA_METERS, 'home-area-median');
    if (area) return area;
  }
  return medianWithin(db, grade, undefined, undefined, 'national-median');
}
