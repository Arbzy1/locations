import { z } from "zod";
import { calibrateFromFillUps } from "@locations/brim/engine";
import { isFixtureMode } from "@locations/brim/shared";
import { eq } from "drizzle-orm";
import type { FillUpRow, VehicleRow } from "./db/rows";
import {
  deleteFillUp,
  getCalibration,
  getFillUp,
  getVehicle,
  listFillUps,
  saveCalibration,
  saveFillUp,
} from "./db/repo";
import type { BrimDb } from "./db/types";
import { brimStations as stations } from "@locations/db";
import { fixtureCorpus } from "./prices";
import { brimTenant, persistLive, requestBrimDb, type BrimContext } from "./context";
import type { Env } from "../env";

const fillUpBody = z.object({
  vehicleId: z.string().min(1),
  odometerMiles: z.number().positive(),
  quantity: z.number().positive(),
  unit: z.enum(["litres", "kwh"]),
  price: z.number().nonnegative(),
  brim: z.boolean(),
  occurredAt: z.string().optional(),
  note: z.string().max(280).optional(),
  stationId: z.string().min(1).optional(),
});

const fillUpPatchBody = z.object({
  odometerMiles: z.number().positive().optional(),
  quantity: z.number().positive().optional(),
  unit: z.enum(["litres", "kwh"]).optional(),
  price: z.number().nonnegative().optional(),
  brim: z.boolean().optional(),
  occurredAt: z.string().optional(),
  note: z.string().max(280).nullable().optional(),
  stationId: z.string().min(1).nullable().optional(),
});

function publicFillUp(row: FillUpRow, stationName?: string) {
  const body: {
    id: string;
    vehicleId: string;
    odometerMiles: number;
    quantity: number;
    unit: FillUpRow["unit"];
    pricePence: number;
    brim: boolean;
    occurredAt: string;
    note?: string;
    stationId?: string;
    stationName?: string;
  } = {
    id: row.id,
    vehicleId: row.vehicle_id,
    odometerMiles: row.odometer_miles,
    quantity: row.quantity,
    unit: row.unit,
    pricePence: row.price_pence,
    brim: row.filled_to_brim,
    occurredAt: row.occurred_at,
  };
  if (row.note) body.note = row.note;
  if (row.station_id) body.stationId = row.station_id;
  if (stationName) body.stationName = stationName;
  return body;
}

async function lookupStation(
  env: Env,
  db: BrimDb,
  stationId: string,
): Promise<{ id: string; name: string } | undefined> {
  if (isFixtureMode(env.BRIM_FIXTURES)) {
    const station = (await fixtureCorpus(env.BRIM_FIXTURES)).stations.find((s) => s.id === stationId);
    return station ? { id: station.id, name: station.name } : undefined;
  }
  if (!persistLive(db) || !db.db) return undefined;
  const rows = await db.db
    .select({ id: stations.id, name: stations.name })
    .from(stations)
    .where(eq(stations.id, stationId));
  const row = rows[0];
  return row ? { id: row.id, name: row.name } : undefined;
}

async function namesForFills(
  env: Env,
  db: BrimDb,
  rows: FillUpRow[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const ids = [...new Set(rows.map((r) => r.station_id).filter((id): id is string => Boolean(id)))];
  for (const id of ids) {
    const hit = await lookupStation(env, db, id);
    if (hit) names.set(hit.id, hit.name);
  }
  return names;
}

function isUnitValidForVehicle(propulsion: VehicleRow["propulsion"], unit: "litres" | "kwh"): boolean {
  if (propulsion === "bev") return unit === "kwh";
  if (propulsion === "phev") return unit === "litres" || unit === "kwh";
  return unit === "litres";
}

function isOdometerMonotonic(
  others: FillUpRow[],
  candidateMiles: number,
  candidateOccurredAt: string,
  candidateUnit: "litres" | "kwh",
  propulsion: VehicleRow["propulsion"],
): boolean {
  const tMs = Date.parse(candidateOccurredAt);
  if (!Number.isFinite(tMs)) return false;

  for (const other of others) {
    const otherMs = Date.parse(other.occurred_at);
    if (!Number.isFinite(otherMs)) continue;
    const crossPhevUnit = propulsion === "phev" && other.unit !== candidateUnit;
    if (otherMs < tMs) {
      if (crossPhevUnit ? candidateMiles < other.odometer_miles : candidateMiles <= other.odometer_miles) {
        return false;
      }
    } else if (otherMs > tMs) {
      if (crossPhevUnit ? candidateMiles > other.odometer_miles : candidateMiles >= other.odometer_miles) {
        return false;
      }
    } else if (!crossPhevUnit && candidateMiles <= other.odometer_miles) {
      return false;
    }
  }
  return true;
}

export async function recomputeCalibration(
  db: BrimDb,
  ownerId: string,
  vehicleId: string,
  nowIso: string,
) {
  const vehicle = await getVehicle(db, ownerId, vehicleId);
  if (!vehicle) return undefined;
  const fills = await listFillUps(db, ownerId, vehicleId);
  const samples = fills.map((f) => ({
    odometerMiles: f.odometer_miles,
    quantity: f.quantity,
    unit: f.unit,
    filledToBrim: f.filled_to_brim,
    occurredAt: f.occurred_at,
  }));
  const kind = vehicle.propulsion === "bev" ? "electric" : "liquid";
  const primary = calibrateFromFillUps(samples, kind);
  const computed =
    primary ?? (vehicle.propulsion === "phev" ? calibrateFromFillUps(samples, "electric") : undefined);
  if (!computed) {
    await saveCalibration(db, ownerId, {
      id: crypto.randomUUID(),
      vehicle_id: vehicleId,
      calculated_value: 0,
      unit: kind === "electric" ? "kWh/100km" : "l/100km",
      sample_count: 0,
      last_computed_at: nowIso,
    });
    return undefined;
  }
  return saveCalibration(db, ownerId, {
    id: crypto.randomUUID(),
    vehicle_id: vehicleId,
    calculated_value: computed.value,
    unit: computed.unit,
    sample_count: computed.sampleCount,
    last_computed_at: nowIso,
    ...(computed.stddev !== undefined ? { stddev: computed.stddev } : {}),
  });
}

function confidence(sampleCount: number): "calibrated" | "building" | "none" {
  if (sampleCount >= 3) return "calibrated";
  if (sampleCount > 0) return "building";
  return "none";
}

export async function createFillUpHandler(c: BrimContext) {
  const tenant = brimTenant(c);
  const parsed = fillUpBody.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "invalid_request" }, 400);
  const db = requestBrimDb(c);
  const vehicle = await getVehicle(db, tenant, parsed.data.vehicleId);
  if (!vehicle) return c.json({ error: "not_found" }, 404);
  if (!isUnitValidForVehicle(vehicle.propulsion, parsed.data.unit)) {
    return c.json({ error: "unit_mismatch" }, 400);
  }
  if (parsed.data.stationId && parsed.data.unit === "kwh") {
    return c.json({ error: "unknown_station" }, 400);
  }
  let stationName: string | undefined;
  if (parsed.data.stationId) {
    const station = await lookupStation(c.env, db, parsed.data.stationId);
    if (!station) return c.json({ error: "unknown_station" }, 400);
    stationName = station.name;
  }
  const occurredAt = parsed.data.occurredAt ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(occurredAt))) {
    return c.json({ error: "invalid_request" }, 400);
  }
  const existing = await listFillUps(db, tenant, vehicle.id);
  if (
    !isOdometerMonotonic(
      existing,
      parsed.data.odometerMiles,
      occurredAt,
      parsed.data.unit,
      vehicle.propulsion,
    )
  ) {
    return c.json({ error: "odometer_rollback" }, 400);
  }
  const row: FillUpRow = {
    id: crypto.randomUUID(),
    vehicle_id: parsed.data.vehicleId,
    odometer_miles: parsed.data.odometerMiles,
    quantity: parsed.data.quantity,
    unit: parsed.data.unit,
    price_pence: Math.round(parsed.data.price),
    filled_to_brim: parsed.data.brim,
    occurred_at: occurredAt,
  };
  if (parsed.data.note) row.note = parsed.data.note;
  if (parsed.data.stationId) row.station_id = parsed.data.stationId;
  const saved = await saveFillUp(db, tenant, row);
  if (!saved) return c.json({ error: "not_found" }, 404);
  await recomputeCalibration(db, tenant, saved.vehicle_id, saved.occurred_at);
  return c.json(publicFillUp(saved, stationName), 201);
}

export async function patchFillUpHandler(c: BrimContext) {
  const tenant = brimTenant(c);
  const db = requestBrimDb(c);
  const existing = await getFillUp(db, tenant, c.req.param("id") ?? "");
  if (!existing) return c.json({ error: "not_found" }, 404);
  const vehicle = await getVehicle(db, tenant, existing.vehicle_id);
  if (!vehicle) return c.json({ error: "not_found" }, 404);
  const parsed = fillUpPatchBody.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "invalid_request" }, 400);

  const nextUnit = parsed.data.unit ?? existing.unit;
  if (!isUnitValidForVehicle(vehicle.propulsion, nextUnit)) {
    return c.json({ error: "unit_mismatch" }, 400);
  }

  const nextOccurredAt = parsed.data.occurredAt ?? existing.occurred_at;
  if (!Number.isFinite(Date.parse(nextOccurredAt))) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const nextMiles = parsed.data.odometerMiles ?? existing.odometer_miles;
  const allFills = await listFillUps(db, tenant, vehicle.id);
  const others = allFills.filter((f) => f.id !== existing.id);
  if (!isOdometerMonotonic(others, nextMiles, nextOccurredAt, nextUnit, vehicle.propulsion)) {
    return c.json({ error: "odometer_rollback" }, 400);
  }

  const nextStationId =
    parsed.data.stationId === null
      ? undefined
      : (parsed.data.stationId ?? existing.station_id);
  if (nextStationId && nextUnit === "kwh") {
    return c.json({ error: "unknown_station" }, 400);
  }
  let stationName: string | undefined;
  if (nextStationId) {
    const station = await lookupStation(c.env, db, nextStationId);
    if (!station) return c.json({ error: "unknown_station" }, 400);
    stationName = station.name;
  }

  const next: FillUpRow = {
    ...existing,
    odometer_miles: nextMiles,
    quantity: parsed.data.quantity ?? existing.quantity,
    unit: nextUnit,
    price_pence:
      parsed.data.price !== undefined ? Math.round(parsed.data.price) : existing.price_pence,
    filled_to_brim: parsed.data.brim ?? existing.filled_to_brim,
    occurred_at: nextOccurredAt,
  };
  if (parsed.data.note === null || parsed.data.note === "") delete next.note;
  else if (parsed.data.note !== undefined) next.note = parsed.data.note;
  if (nextStationId) next.station_id = nextStationId;
  else delete next.station_id;

  const saved = await saveFillUp(db, tenant, next);
  if (!saved) return c.json({ error: "not_found" }, 404);
  await recomputeCalibration(db, tenant, saved.vehicle_id, new Date().toISOString());
  return c.json(publicFillUp(saved, stationName));
}

export async function listFillUpsHandler(c: BrimContext) {
  const tenant = brimTenant(c);
  const vehicleId = c.req.param("id") ?? "";
  const db = requestBrimDb(c);
  if (!(await getVehicle(db, tenant, vehicleId))) return c.json({ error: "not_found" }, 404);
  const rows = await listFillUps(db, tenant, vehicleId);
  const names = await namesForFills(c.env, db, rows);
  return c.json({
    fillUps: rows.map((row) => publicFillUp(row, row.station_id ? names.get(row.station_id) : undefined)),
  });
}

export async function deleteFillUpHandler(c: BrimContext) {
  const tenant = brimTenant(c);
  const db = requestBrimDb(c);
  const existing = await getFillUp(db, tenant, c.req.param("id") ?? "");
  if (!existing) return c.json({ error: "not_found" }, 404);
  await deleteFillUp(db, tenant, existing.id);
  await recomputeCalibration(db, tenant, existing.vehicle_id, new Date().toISOString());
  return c.json({ ok: true });
}

export async function getCalibrationHandler(c: BrimContext) {
  const tenant = brimTenant(c);
  const db = requestBrimDb(c);
  const vehicleId = c.req.param("id") ?? "";
  if (!(await getVehicle(db, tenant, vehicleId))) return c.json({ error: "not_found" }, 404);
  const row = await getCalibration(db, tenant, vehicleId);
  const sampleCount = row?.sample_count ?? 0;
  return c.json({
    value: sampleCount > 0 ? row?.calculated_value : undefined,
    unit: row?.unit,
    sampleCount,
    stddev: row?.stddev,
    confidence: confidence(sampleCount),
  });
}
