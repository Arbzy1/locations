import { z } from 'zod';
import { complianceForZone, resolveCharges } from '@locations/brim/engine';
import {
  CHARGE_CATALOGUE,
  TOLL_CATALOGUE,
  ZONE_CATALOGUE,
  decodePolyline,
  detectHitsFromLine,
  isFixtureMode,
  simplifyRdp,
  vehicleProfileSchema,
  type ChargeHit,
  type ChargeScheme,
  type VehicleProfile,
} from '@locations/brim/shared';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { getVehicle } from './db/repo';
import { withRls } from './db/with-rls';
import type { BrimDb } from './db/types';
import type { VehicleRow } from './db/rows';
import { createDb, brimTenant, persistLive, type BrimContext } from "./context";
import type { Env } from "../env";

const DUMMY_GEOMETRY: ChargeScheme['geometry'] = {
  type: 'MultiPolygon',
  coordinates: [[[[-0.1, 51.4], [-0.09, 51.4], [-0.09, 51.41], [-0.1, 51.41], [-0.1, 51.4]]]],
};

type ZoneSqlRow = {
  id: string;
  name: string;
  authority: string | null;
  kind: string;
  caz_class: string | null;
  charge_pence: number | null;
  is_restriction: boolean;
  applies_hours_json: ChargeScheme['appliesHours'] | null;
  source_url: string | null;
  verified_on: string | Date | null;
  operator_url: string | null;
  dataset_version: string | null;
  charge_pence_by_class_json?: ChargeScheme['chargePenceByClass'] | null;
  operator?: string | null;
};

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === 'object' && 'rows' in result) return (result as { rows: T[] }).rows;
  return [];
}

function toWkt(points: Array<{ lat: number; lng: number }>): string {
  const simplified = simplifyRdp(points, 0.0003);
  const seq = simplified.map((p) => `${p.lng} ${p.lat}`).join(', ');
  return `LINESTRING(${seq})`;
}

function rowToScheme(row: ZoneSqlRow, schemeKind: ChargeScheme['schemeKind']): ChargeScheme {
  const scheme: ChargeScheme = {
    id: row.id,
    name: row.name,
    schemeKind,
    isRestriction: Boolean(row.is_restriction) || schemeKind === 'lez',
    appliesHours: row.applies_hours_json ?? { timezone: 'Europe/London', always: true },
    sourceUrl: row.source_url ?? '',
    verifiedOn: row.verified_on ? String(row.verified_on).slice(0, 10) : '1970-01-01',
    operatorUrl: row.operator_url ?? row.source_url ?? '',
    datasetVersion: row.dataset_version ?? '',
    geometry: DUMMY_GEOMETRY,
  };
  if (row.authority) scheme.authority = row.authority;
  if (row.caz_class === 'C' || row.caz_class === 'D') scheme.cazClass = row.caz_class;
  if (row.charge_pence !== null && row.charge_pence !== undefined) scheme.chargePence = Number(row.charge_pence);
  if (row.charge_pence_by_class_json) scheme.chargePenceByClass = row.charge_pence_by_class_json;
  return scheme;
}

async function liveHits(db: BrimDb, wkt: string): Promise<ChargeHit[]> {
  return withRls(db, { shared: true }, async (tx) => {
    const zones = rowsOf<ZoneSqlRow>(
      await tx.execute(sql`
        SELECT id, name, authority, kind, caz_class, charge_pence, is_restriction,
               applies_hours_json, source_url, verified_on, operator_url, dataset_version
        FROM brim_zones
        WHERE geometry IS NOT NULL
          AND ST_Intersects(geometry, ST_GeomFromText(${wkt}, 4326)::geography)
      `),
    );
    const nearZones = rowsOf<ZoneSqlRow>(
      await tx.execute(sql`
        SELECT id, name, authority, kind, caz_class, charge_pence, is_restriction,
               applies_hours_json, source_url, verified_on, operator_url, dataset_version
        FROM brim_zones
        WHERE geometry IS NOT NULL
          AND ST_DWithin(geometry, ST_GeomFromText(${wkt}, 4326)::geography, 500)
          AND NOT ST_Intersects(geometry, ST_GeomFromText(${wkt}, 4326)::geography)
      `),
    );
    const tolls = rowsOf<ZoneSqlRow>(
      await tx.execute(sql`
        SELECT id, name, operator, charge_pence_by_class_json, applies_hours_json,
               source_url, verified_on, operator_url
        FROM brim_tolls
        WHERE location IS NOT NULL
          AND ST_Intersects(location, ST_GeomFromText(${wkt}, 4326)::geography)
      `),
    );
    const nearTolls = rowsOf<ZoneSqlRow>(
      await tx.execute(sql`
        SELECT id, name, operator, charge_pence_by_class_json, applies_hours_json,
               source_url, verified_on, operator_url
        FROM brim_tolls
        WHERE location IS NOT NULL
          AND ST_DWithin(location, ST_GeomFromText(${wkt}, 4326)::geography, 500)
          AND NOT ST_Intersects(location, ST_GeomFromText(${wkt}, 4326)::geography)
      `),
    );
    const hits: ChargeHit[] = [];
    for (const row of zones) {
      const kind = row.kind === 'ulez' || row.kind === 'congestion' || row.kind === 'caz' || row.kind === 'lez'
        ? row.kind
        : 'ulez';
      hits.push({ scheme: rowToScheme(row, kind), relation: 'intersects' });
    }
    for (const row of nearZones) {
      const kind = row.kind === 'ulez' || row.kind === 'congestion' || row.kind === 'caz' || row.kind === 'lez'
        ? row.kind
        : 'ulez';
      hits.push({ scheme: rowToScheme(row, kind), relation: 'near' });
    }
    for (const row of tolls) {
      hits.push({ scheme: rowToScheme({ ...row, is_restriction: false, kind: 'toll' }, 'toll'), relation: 'intersects' });
    }
    for (const row of nearTolls) {
      hits.push({ scheme: rowToScheme({ ...row, is_restriction: false, kind: 'toll' }, 'toll'), relation: 'near' });
    }
    return hits;
  });
}

export async function detectChargeHits(
  env: Env,
  db: BrimDb,
  encodedPolyline: string,
): Promise<ChargeHit[]> {
  const points = decodePolyline(encodedPolyline);
  if (points.length < 2) return [];
  if (isFixtureMode(env.BRIM_FIXTURES) || !persistLive(db)) {
    return detectHitsFromLine(points);
  }
  return liveHits(db, toWkt(points));
}

export function resolveRouteCharges(input: {
  hits: ChargeHit[];
  vehicle?: VehicleProfile | undefined;
  departsAt: string;
  durationSeconds: number;
}) {
  return resolveCharges(input);
}

export const FIXTURE_CHARGE_DEPARTS_AT = '2026-08-14T08:00:00Z';

export function defaultDepartsAt(env: Env, explicit?: string): string {
  if (explicit) return explicit;
  if (isFixtureMode(env.BRIM_FIXTURES)) return FIXTURE_CHARGE_DEPARTS_AT;
  return new Date().toISOString();
}

function vehicleFromRow(row: VehicleRow): VehicleProfile {
  const profile: VehicleProfile = { kind: row.kind, propulsion: row.propulsion };
  if (row.year !== undefined) profile.year = row.year;
  if (row.euro_status) profile.euroStatus = row.euro_status;
  if (row.euro_status_source === 'dvla' || row.euro_status_source === 'derived') {
    profile.euroStatusSource = row.euro_status_source;
  }
  return profile;
}

const forRouteBody = z.object({
  polyline: z.string().min(1),
  departsAt: z.string().optional(),
  durationSeconds: z.number().optional(),
  vehicleId: z.string().optional(),
  vehicleInline: vehicleProfileSchema.optional(),
});

export async function handleChargesForRoute(c: BrimContext) {
  const db = createDb(c.env);
  const raw =
    c.req.method === 'GET'
      ? {
          polyline: c.req.query('polyline'),
          departsAt: c.req.query('departsAt'),
          vehicleId: c.req.query('vehicleId'),
        }
      : await c.req.json();
  const parsed = forRouteBody.safeParse(raw);
  if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
  const tenant = brimTenant(c);
  let vehicle = parsed.data.vehicleInline;
  if (!vehicle && parsed.data.vehicleId) {
    const row = await getVehicle(db, tenant, parsed.data.vehicleId);
    if (row) vehicle = vehicleFromRow(row);
  }
  const hits = await detectChargeHits(c.env, db, parsed.data.polyline);
  const resolved = resolveCharges({
    hits,
    ...(vehicle ? { vehicle } : {}),
    departsAt: defaultDepartsAt(c.env, parsed.data.departsAt),
    durationSeconds: parsed.data.durationSeconds ?? 3600,
  });
  return c.json(resolved);
}

export async function handleZones(c: BrimContext) {
  const db = createDb(c.env);
  if (isFixtureMode(c.env.BRIM_FIXTURES) || !persistLive(db)) {
    return c.json({
      zones: ZONE_CATALOGUE.map(publicZone),
      tolls: TOLL_CATALOGUE.map(publicZone),
    });
  }
  const rows = await withRls(db, { shared: true }, async (tx) =>
    rowsOf<ZoneSqlRow>(
      await tx.execute(sql`
        SELECT id, name, authority, kind, caz_class, charge_pence, is_restriction,
               applies_hours_json, source_url, verified_on, operator_url, dataset_version
        FROM brim_zones
        ORDER BY name
      `),
    ),
  );
  const tolls = await withRls(db, { shared: true }, async (tx) =>
    rowsOf<ZoneSqlRow>(
      await tx.execute(sql`
        SELECT id, name, operator, charge_pence_by_class_json, applies_hours_json,
               source_url, verified_on, operator_url
        FROM brim_tolls
        ORDER BY name
      `),
    ),
  );
  return c.json({
    zones: rows.map((r) =>
      publicZone(rowToScheme(r, r.kind === 'caz' || r.kind === 'ulez' || r.kind === 'congestion' || r.kind === 'lez' ? r.kind : 'ulez')),
    ),
    tolls: tolls.map((r) => publicZone(rowToScheme({ ...r, is_restriction: false, kind: 'toll' }, 'toll'))),
  });
}

function publicZone(scheme: ChargeScheme) {
  return {
    id: scheme.id,
    name: scheme.name,
    kind: scheme.schemeKind,
    isRestriction: scheme.isRestriction,
    verifiedOn: scheme.verifiedOn,
    sourceUrl: scheme.sourceUrl,
    operatorUrl: scheme.operatorUrl,
    ...(scheme.cazClass ? { cazClass: scheme.cazClass } : {}),
    ...(scheme.chargePence !== undefined ? { chargePence: scheme.chargePence } : {}),
  };
}

export async function handleVehicleCompliance(c: BrimContext) {
  const tenant = brimTenant(c);
  const db = createDb(c.env);
  const row = await getVehicle(db, tenant, c.req.param('id') ?? '');
  if (!row) return c.json({ error: 'not_found' }, 404);
  const vehicle = vehicleFromRow(row);
  const zones = CHARGE_CATALOGUE.filter((s) => s.schemeKind !== 'toll').map((zone) => {
    const result = complianceForZone({ vehicle, zone });
    return {
      id: zone.id,
      name: zone.name,
      kind: zone.schemeKind,
      verdict: result.verdict,
      euroStatusSource: result.euro.source,
      derived: result.euro.derived,
      operatorUrl: zone.operatorUrl,
      ...(result.euro.source === 'dvla'
        ? {}
        : { caveat: 'Euro standard is not from DVLA. Check with the operator.' }),
    };
  });
  return c.json({ vehicleId: row.id, zones });
}
