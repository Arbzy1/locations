import { z } from "zod";
import { complianceForZone, resolveCharges } from "@locations/brim/engine";
import {
  TOLL_CATALOGUE,
  ZONE_CATALOGUE,
  decodePolyline,
  detectHitsFromLine,
  isFixtureMode,
  linePolygonSpan,
  schemeById,
  simplifyRdp,
  vehicleProfileSchema,
  type ChargeHit,
  type ChargeScheme,
  type VehicleProfile,
  type ZoneGeometry,
} from "@locations/brim/shared";
import { sql } from "drizzle-orm";
import { getVehicle } from "./db/repo";
import { withRls } from "./db/with-rls";
import type { BrimDb } from "./db/types";
import type { VehicleRow } from "./db/rows";
import { brimTenant, persistLive, requestBrimDb, type BrimContext } from "./context";
import type { Env } from "../env";

const DUMMY_GEOMETRY: ChargeScheme["geometry"] = {
  type: "MultiPolygon",
  coordinates: [
    [
      [
        [-0.1, 51.4],
        [-0.09, 51.4],
        [-0.09, 51.41],
        [-0.1, 51.41],
        [-0.1, 51.4],
      ],
    ],
  ],
};

type ZoneSqlRow = {
  id: string;
  name: string;
  authority: string | null;
  kind: string;
  caz_class: string | null;
  charge_pence: number | null;
  is_restriction: boolean;
  applies_hours_json: ChargeScheme["appliesHours"] | null;
  source_url: string | null;
  verified_on: string | Date | null;
  operator_url: string | null;
  dataset_version: string | null;
  charge_pence_by_class_json?: ChargeScheme["chargePenceByClass"] | null;
  operator?: string | null;
  geometry_json?: string | null;
};

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) return (result as { rows: T[] }).rows;
  return [];
}

function toWkt(points: Array<{ lat: number; lng: number }>): string {
  const simplified = simplifyRdp(points, 0.0003);
  const seq = simplified.map((p) => `${p.lng} ${p.lat}`).join(", ");
  return `LINESTRING(${seq})`;
}

function parseGeoJsonGeometry(raw: string | null | undefined, fallbackId: string): ZoneGeometry {
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { type?: string; coordinates?: unknown };
      if (
        (parsed.type === "Polygon" || parsed.type === "MultiPolygon") &&
        Array.isArray(parsed.coordinates)
      ) {
        return parsed as ZoneGeometry;
      }
    } catch {
      /* ignore invalid geometry JSON */
    }
  }
  return schemeById(fallbackId)?.geometry ?? DUMMY_GEOMETRY;
}

function round5(n: number): number {
  return Math.round(n * 100_000) / 100_000;
}

function simplifyRing(ring: number[][]): number[][] {
  if (ring.length <= 5) {
    return ring.map((pt) => [round5(pt[0] ?? 0), round5(pt[1] ?? 0)]);
  }
  const pts = ring.map((pt) => ({ lng: pt[0] ?? 0, lat: pt[1] ?? 0 }));
  const simplified = simplifyRdp(pts, 0.0004);
  if (simplified.length < 4) {
    return ring.map((pt) => [round5(pt[0] ?? 0), round5(pt[1] ?? 0)]);
  }
  const out = simplified.map((p) => [round5(p.lng), round5(p.lat)]);
  const first = out[0];
  const last = out[out.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
    out.push([first[0]!, first[1]!]);
  }
  return out;
}

function simplifyZoneGeometry(geometry: ZoneGeometry): ZoneGeometry {
  if (geometry.type === "Polygon") {
    return {
      type: "Polygon",
      coordinates: (geometry.coordinates as number[][][]).map(simplifyRing),
    };
  }
  return {
    type: "MultiPolygon",
    coordinates: (geometry.coordinates as number[][][][]).map((poly) => poly.map(simplifyRing)),
  };
}

function rowToScheme(row: ZoneSqlRow, schemeKind: ChargeScheme["schemeKind"]): ChargeScheme {
  const catalogMatch = schemeById(row.id);
  const scheme: ChargeScheme = {
    id: row.id,
    name: row.name,
    schemeKind,
    isRestriction: Boolean(row.is_restriction) || schemeKind === "lez",
    appliesHours: row.applies_hours_json ?? { timezone: "Europe/London", always: true },
    sourceUrl: row.source_url ?? "",
    verifiedOn: row.verified_on ? String(row.verified_on).slice(0, 10) : "1970-01-01",
    operatorUrl: row.operator_url ?? row.source_url ?? "",
    datasetVersion: row.dataset_version ?? "",
    geometry: parseGeoJsonGeometry(row.geometry_json, row.id),
  };
  const authority = row.authority ?? row.operator;
  if (authority) scheme.authority = authority;
  if (row.caz_class === "C" || row.caz_class === "D") scheme.cazClass = row.caz_class;
  if (row.charge_pence !== null && row.charge_pence !== undefined) scheme.chargePence = Number(row.charge_pence);
  if (row.charge_pence_by_class_json) scheme.chargePenceByClass = row.charge_pence_by_class_json;
  if (catalogMatch?.offpeakChargePenceByClass) {
    scheme.offpeakChargePenceByClass = catalogMatch.offpeakChargePenceByClass;
  }
  if (catalogMatch?.peakHours) {
    scheme.peakHours = catalogMatch.peakHours;
  }
  return scheme;
}

function normaliseZoneKind(kind: string): Exclude<ChargeScheme["schemeKind"], "toll"> {
  if (kind === "ulez" || kind === "congestion" || kind === "caz" || kind === "lez") return kind;
  return "ulez";
}

async function liveHits(
  db: BrimDb,
  wkt: string,
  points: Array<{ lat: number; lng: number }>,
): Promise<ChargeHit[]> {
  return withRls(db, { shared: true }, async (tx) => {
    const zones = rowsOf<ZoneSqlRow>(
      await tx.execute(sql`
        SELECT id, name, authority, kind, caz_class, charge_pence, is_restriction,
               applies_hours_json, source_url, verified_on, operator_url, dataset_version,
               ST_AsGeoJSON(geometry::geometry) AS geometry_json
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
               source_url, verified_on, operator_url,
               ST_AsGeoJSON(location::geometry) AS geometry_json
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
      const scheme = rowToScheme(row, normaliseZoneKind(row.kind));
      const span = linePolygonSpan(points, scheme.geometry);
      hits.push({
        scheme,
        relation: "intersects",
        ...(span ? { entryFraction: span.entryFraction, exitFraction: span.exitFraction } : {}),
      });
    }
    for (const row of nearZones) {
      hits.push({ scheme: rowToScheme(row, normaliseZoneKind(row.kind)), relation: "near" });
    }
    for (const row of tolls) {
      const scheme = rowToScheme({ ...row, is_restriction: false, kind: "toll" }, "toll");
      const span = linePolygonSpan(points, scheme.geometry);
      hits.push({
        scheme,
        relation: "intersects",
        ...(span ? { entryFraction: span.entryFraction, exitFraction: span.exitFraction } : {}),
      });
    }
    for (const row of nearTolls) {
      hits.push({ scheme: rowToScheme({ ...row, is_restriction: false, kind: "toll" }, "toll"), relation: "near" });
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
  return liveHits(db, toWkt(points), points);
}

export function resolveRouteCharges(input: {
  hits: ChargeHit[];
  vehicle?: VehicleProfile | undefined;
  departsAt: string;
  durationSeconds: number;
}) {
  return resolveCharges(input);
}

export const FIXTURE_CHARGE_DEPARTS_AT = "2026-08-14T08:00:00Z";

export function defaultDepartsAt(env: Env, explicit?: string): string {
  if (explicit) return explicit;
  if (isFixtureMode(env.BRIM_FIXTURES)) return FIXTURE_CHARGE_DEPARTS_AT;
  return new Date().toISOString();
}

function vehicleFromRow(row: VehicleRow): VehicleProfile {
  const profile: VehicleProfile = { kind: row.kind, propulsion: row.propulsion };
  if (row.year !== undefined) profile.year = row.year;
  if (row.euro_status) profile.euroStatus = row.euro_status;
  if (row.euro_status_source === "dvla" || row.euro_status_source === "derived") {
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
  const db = requestBrimDb(c);
  const raw =
    c.req.method === "GET"
      ? {
          polyline: c.req.query("polyline"),
          departsAt: c.req.query("departsAt"),
          durationSeconds: c.req.query("durationSeconds")
            ? Number(c.req.query("durationSeconds"))
            : undefined,
          vehicleId: c.req.query("vehicleId"),
        }
      : await c.req.json();
  const parsed = forRouteBody.safeParse(raw);
  if (!parsed.success) return c.json({ error: "invalid_request" }, 400);
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
  const db = requestBrimDb(c);
  const wantGeometry = c.req.query("geometry") === "1" || c.req.query("geometry") === "true";
  if (isFixtureMode(c.env.BRIM_FIXTURES) || !persistLive(db)) {
    return c.json({
      zones: ZONE_CATALOGUE.map((s) => publicZone(s, wantGeometry)),
      tolls: TOLL_CATALOGUE.map((s) => publicZone(s, wantGeometry)),
    });
  }
  const rows = await withRls(db, { shared: true }, async (tx) =>
    rowsOf<ZoneSqlRow>(
      await tx.execute(
        wantGeometry
          ? sql`
              SELECT id, name, authority, kind, caz_class, charge_pence, is_restriction,
                     applies_hours_json, source_url, verified_on, operator_url, dataset_version,
                     ST_AsGeoJSON(ST_SimplifyPreserveTopology(geometry::geometry, 0.0005)) AS geometry_json
              FROM brim_zones
              ORDER BY name
            `
          : sql`
              SELECT id, name, authority, kind, caz_class, charge_pence, is_restriction,
                     applies_hours_json, source_url, verified_on, operator_url, dataset_version
              FROM brim_zones
              ORDER BY name
            `,
      ),
    ),
  );
  const tolls = await withRls(db, { shared: true }, async (tx) =>
    rowsOf<ZoneSqlRow>(
      await tx.execute(
        wantGeometry
          ? sql`
              SELECT id, name, operator, charge_pence_by_class_json, applies_hours_json,
                     source_url, verified_on, operator_url,
                     ST_AsGeoJSON(ST_SimplifyPreserveTopology(location::geometry, 0.0005)) AS geometry_json
              FROM brim_tolls
              ORDER BY name
            `
          : sql`
              SELECT id, name, operator, charge_pence_by_class_json, applies_hours_json,
                     source_url, verified_on, operator_url
              FROM brim_tolls
              ORDER BY name
            `,
      ),
    ),
  );
  return c.json({
    zones: rows.map((r) => publicZone(rowToScheme(r, normaliseZoneKind(r.kind)), wantGeometry)),
    tolls: tolls.map((r) =>
      publicZone(rowToScheme({ ...r, is_restriction: false, kind: "toll" }, "toll"), wantGeometry),
    ),
  });
}

function publicZone(scheme: ChargeScheme, includeGeometry = false) {
  return {
    id: scheme.id,
    name: scheme.name,
    kind: scheme.schemeKind,
    isRestriction: scheme.isRestriction,
    verifiedOn: scheme.verifiedOn,
    sourceUrl: scheme.sourceUrl,
    operatorUrl: scheme.operatorUrl,
    ...(scheme.authority ? { authority: scheme.authority } : {}),
    ...(scheme.cazClass ? { cazClass: scheme.cazClass } : {}),
    ...(scheme.chargePence !== undefined ? { chargePence: scheme.chargePence } : {}),
    ...(scheme.chargePenceByClass ? { chargePenceByClass: scheme.chargePenceByClass } : {}),
    ...(includeGeometry ? { geometry: simplifyZoneGeometry(scheme.geometry) } : {}),
  };
}

export async function handleVehicleCompliance(c: BrimContext) {
  const tenant = brimTenant(c);
  const db = requestBrimDb(c);
  const row = await getVehicle(db, tenant, c.req.param("id") ?? "");
  if (!row) return c.json({ error: "not_found" }, 404);
  const vehicle = vehicleFromRow(row);

  let zoneSchemes: ChargeScheme[];
  if (isFixtureMode(c.env.BRIM_FIXTURES) || !persistLive(db)) {
    zoneSchemes = ZONE_CATALOGUE;
  } else {
    const liveRows = await withRls(db, { shared: true }, async (tx) =>
      rowsOf<ZoneSqlRow>(
        await tx.execute(sql`
          SELECT id, name, authority, kind, caz_class, charge_pence, is_restriction,
                 applies_hours_json, source_url, verified_on, operator_url, dataset_version
          FROM brim_zones
          ORDER BY name
        `),
      ),
    );
    zoneSchemes =
      liveRows.length > 0
        ? liveRows.map((r) => rowToScheme(r, normaliseZoneKind(r.kind)))
        : ZONE_CATALOGUE;
  }

  const zones = zoneSchemes.map((zone) => {
    const result = complianceForZone({ vehicle, zone });
    return {
      id: zone.id,
      name: zone.name,
      kind: zone.schemeKind,
      verdict: result.verdict,
      euroStatusSource: result.euro.source,
      derived: result.euro.derived,
      operatorUrl: zone.operatorUrl,
      ...(zone.chargePence !== undefined ? { chargePence: zone.chargePence } : {}),
      ...(zone.cazClass ? { cazClass: zone.cazClass } : {}),
      ...(result.euro.source === "dvla"
        ? {}
        : { caveat: "Euro standard is not from DVLA. Check with the operator." }),
    };
  });
  return c.json({ vehicleId: row.id, zones });
}
