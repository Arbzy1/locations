import { hmrcAmapPence, ukTaxYearStartUtc } from "@locations/brim/shared";
import { z } from "zod";
import {
  deleteJourney,
  getJourney,
  getVehicle,
  listJourneys,
  listVehicles,
  saveJourney,
  ytdMiles,
} from "./db/repo";
import type { JourneyRow, VehicleRow } from "./db/rows";
import { brimTenant, requestBrimDb, type BrimContext } from "./context";

const bandPointSchema = z.object({
  point: z.number().finite().nonnegative(),
  low: z.number().finite().nonnegative().optional(),
  high: z.number().finite().nonnegative().optional(),
});

const saveEstimateSchema = z
  .object({
    distanceMeters: z.number().finite().nonnegative(),
    durationSeconds: z.number().finite().nonnegative(),
    charges: z.array(z.unknown()).default([]),
    cost: z.object({
      energyPence: bandPointSchema,
      chargesPence: z.number().finite().nonnegative(),
      totalPence: bandPointSchema,
    }),
    encodedPolyline: z.string().optional(),
  })
  .passthrough();

const saveBody = z.object({
  origin: z.string().min(1),
  destination: z.string().min(1),
  vehicleId: z.string().min(1).optional(),
  departsAt: z.string().optional(),
  polyline: z.string().optional(),
  estimate: saveEstimateSchema,
});

function vehicleDisplayName(v: VehicleRow): string {
  return v.nickname?.trim() || [v.make, v.model].filter(Boolean).join(" ").trim() || v.propulsion;
}

export async function saveJourneyHandler(c: BrimContext) {
  const tenant = brimTenant(c);
  const parsed = saveBody.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "invalid_request" }, 400);
  const db = requestBrimDb(c);

  if (parsed.data.vehicleId) {
    const owned = await getVehicle(db, tenant, parsed.data.vehicleId);
    if (!owned) return c.json({ error: "not_found" }, 404);
  }

  let departsIso: string | undefined;
  if (parsed.data.departsAt) {
    const ms = Date.parse(parsed.data.departsAt);
    if (!Number.isFinite(ms)) return c.json({ error: "invalid_request" }, 400);
    departsIso = new Date(ms).toISOString();
  }

  const estimate = parsed.data.estimate;
  const polyline = parsed.data.polyline ?? estimate.encodedPolyline;
  const row: JourneyRow = {
    id: crypto.randomUUID(),
    tenant,
    origin_label: parsed.data.origin,
    dest_label: parsed.data.destination,
    distance_meters: estimate.distanceMeters,
    duration_seconds: estimate.durationSeconds,
    estimate_json: estimate,
    charges_json: estimate.charges,
    is_saved: true,
    created_at: new Date().toISOString(),
  };
  if (parsed.data.vehicleId) row.vehicle_id = parsed.data.vehicleId;
  if (departsIso) row.departs_at = departsIso;
  if (polyline) row.polyline = polyline;
  return c.json(await saveJourney(db, row), 201);
}

type EstimateSnap = {
  cost?: {
    energyPence?: { point?: number };
    chargesPence?: number;
    totalPence?: { point?: number; low?: number; high?: number };
  };
  hmrc?: {
    approvedPence?: number;
    ytdMiles?: number;
    crossedThreshold?: boolean;
    passengerPence?: number;
  };
  reasons?: string[];
  consumption?: { label?: string };
  origin?: { label?: string; lat?: number; lng?: number };
  destination?: { label?: string; lat?: number; lng?: number };
  waypoints?: Array<{ label: string; lat: number; lng: number }>;
  encodedPolyline?: string;
  roundTrip?: boolean;
};

function snap(j: JourneyRow): EstimateSnap {
  return (j.estimate_json ?? {}) as EstimateSnap;
}

function listItem(j: JourneyRow, nickname?: string) {
  const estimate = snap(j);
  return {
    id: j.id,
    origin: j.origin_label,
    destination: j.dest_label,
    distanceMeters: j.distance_meters,
    miles: j.distance_meters / 1609.344,
    energyPence: estimate.cost?.energyPence?.point ?? 0,
    chargesPence: estimate.cost?.chargesPence ?? 0,
    totalPence: estimate.cost?.totalPence?.point ?? 0,
    hmrcPence: estimate.hmrc?.approvedPence ?? 0,
    vehicleId: j.vehicle_id,
    vehicleNickname: nickname,
    departsAt: j.departs_at,
    createdAt: j.created_at,
  };
}

export async function listJourneysHandler(c: BrimContext) {
  const tenant = brimTenant(c);
  const db = requestBrimDb(c);
  const limit = Number(c.req.query("limit") ?? 50);
  const vehicles = await listVehicles(db, tenant);
  const names = new Map(vehicles.map((v) => [v.id, vehicleDisplayName(v)]));
  const items = (await listJourneys(db, tenant)).slice(
    0,
    Number.isFinite(limit) ? limit : 50,
  );
  return c.json({
    journeys: items.map((j) => listItem(j, j.vehicle_id ? names.get(j.vehicle_id) : undefined)),
  });
}

export async function journeySummaryHandler(c: BrimContext) {
  const tenant = brimTenant(c);
  const db = requestBrimDb(c);
  const nowIso = new Date().toISOString();
  const yearStart = ukTaxYearStartUtc(nowIso);
  const startMs = Date.parse(yearStart);
  const endMs = Date.parse(nowIso);
  const vehicles = await listVehicles(db, tenant);
  const kindById = new Map(vehicles.map((v) => [v.id, v.kind]));

  const rows = (await listJourneys(db, tenant)).filter((j) => {
    const atMs = Date.parse(j.departs_at ?? j.created_at);
    return Number.isFinite(atMs) && atMs >= startMs && atMs <= endMs;
  });

  const miles = await ytdMiles(db, tenant, yearStart, nowIso);
  const motoMiles = await ytdMiles(db, tenant, yearStart, nowIso, "motorcycle");
  const carVanMiles = Math.max(0, miles - motoMiles);

  const actualPence = rows.reduce((sum, j) => sum + (snap(j).cost?.totalPence?.point ?? 0), 0);
  const passengerPence = rows.reduce((sum, j) => sum + (snap(j).hmrc?.passengerPence ?? 0), 0);
  const carHmrc = hmrcAmapPence(carVanMiles, 0, { kind: "car" });
  const motoHmrc = hmrcAmapPence(motoMiles, 0, { kind: "motorcycle" });
  void kindById;

  return c.json({
    taxYearStart: yearStart,
    miles,
    actualPence,
    approvedPence: carHmrc.approvedPence + motoHmrc.approvedPence + passengerPence,
    crossedThreshold: carVanMiles > 10_000,
  });
}

export async function getJourneyHandler(c: BrimContext) {
  const tenant = brimTenant(c);
  const db = requestBrimDb(c);
  const row = await getJourney(db, tenant, c.req.param("id") ?? "");
  if (!row) return c.json({ error: "not_found" }, 404);
  const estimate = snap(row);
  let vehicleNickname: string | undefined;
  if (row.vehicle_id) {
    const match = await getVehicle(db, tenant, row.vehicle_id);
    if (match) vehicleNickname = vehicleDisplayName(match);
  }
  const polyline = row.polyline ?? estimate.encodedPolyline;
  return c.json({
    ...listItem(row, vehicleNickname),
    durationSeconds: row.duration_seconds,
    departsAt: row.departs_at,
    ...(polyline ? { polyline } : {}),
    estimate: row.estimate_json,
    reasons: estimate.reasons ?? [],
    consumptionLabel: estimate.consumption?.label,
    originPin: estimate.origin,
    destinationPin: estimate.destination,
    ...(estimate.waypoints ? { waypoints: estimate.waypoints } : {}),
    ...(estimate.roundTrip ? { roundTrip: true } : {}),
    totalLowPence: estimate.cost?.totalPence?.low,
    totalHighPence: estimate.cost?.totalPence?.high,
    hmrc: estimate.hmrc,
  });
}

export async function deleteJourneyHandler(c: BrimContext) {
  const tenant = brimTenant(c);
  if (!(await deleteJourney(requestBrimDb(c), tenant, c.req.param("id") ?? ""))) {
    return c.json({ error: "not_found" }, 404);
  }
  return c.json({ ok: true });
}

export function csvEscape(value: string): string {
  const neutralised = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (/[",\n\r\t]/.test(neutralised)) {
    return `"${neutralised.replaceAll('"', '""')}"`;
  }
  return neutralised;
}

export async function exportJourneysHandler(c: BrimContext) {
  const tenant = brimTenant(c);
  const db = requestBrimDb(c);
  const [rows, vehicles] = await Promise.all([
    listJourneys(db, tenant),
    listVehicles(db, tenant),
  ]);
  const vehicleNames = new Map(vehicles.map((v) => [v.id, vehicleDisplayName(v)]));
  const header =
    "date,from,to,miles,vehicle,energy cost,charges,total,HMRC approved amount,difference";
  const lines = rows.map((j) => {
    const estimate = snap(j);
    const energyPence = estimate.cost?.energyPence?.point ?? 0;
    const chargesPence = estimate.cost?.chargesPence ?? 0;
    const totalPence = estimate.cost?.totalPence?.point ?? 0;
    const approvedPence = estimate.hmrc?.approvedPence ?? 0;
    const miles = (j.distance_meters / 1609.344).toFixed(1);
    const energy = (energyPence / 100).toFixed(2);
    const charges = (chargesPence / 100).toFixed(2);
    const total = (totalPence / 100).toFixed(2);
    const hmrc = (approvedPence / 100).toFixed(2);
    const diff = ((totalPence - approvedPence) / 100).toFixed(2);
    const vehicleLabel = j.vehicle_id ? (vehicleNames.get(j.vehicle_id) ?? "Deleted vehicle") : "";
    const effectiveDate = (j.departs_at ?? j.created_at).slice(0, 10);
    return [
      effectiveDate,
      csvEscape(j.origin_label),
      csvEscape(j.dest_label),
      miles,
      csvEscape(vehicleLabel),
      energy,
      charges,
      total,
      hmrc,
      diff,
    ].join(",");
  });
  const body = `\uFEFF${header}\n${lines.join("\n")}\n`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="journey-cost.csv"',
    },
  });
}
