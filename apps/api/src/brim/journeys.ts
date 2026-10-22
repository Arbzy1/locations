import { hmrcAmapPence, ukTaxYearStartUtc } from '@locations/brim/shared';
import { z } from 'zod';
import type { Context } from 'hono';
import { deleteJourney, getJourney, listJourneys, listVehicles, saveJourney, ytdMiles } from './db/repo';
import type { JourneyRow } from './db/rows';
import { brimTenant, createDb, type BrimContext } from "./context";

const saveBody = z.object({
  origin: z.string(),
  destination: z.string(),
  vehicleId: z.string().optional(),
  departsAt: z.string().optional(),
  estimate: z.record(z.string(), z.unknown()),
});

export async function saveJourneyHandler(c: BrimContext) {
  const tenant = brimTenant(c);
  const parsed = saveBody.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
  const estimate = parsed.data.estimate as {
    distanceMeters: number;
    durationSeconds: number;
    charges: unknown;
    cost: { energyPence: { point: number }; chargesPence: number; totalPence: { point: number } };
  };
  const row: JourneyRow = {
    id: crypto.randomUUID(),
    tenant: tenant,
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
  if (parsed.data.departsAt) row.departs_at = parsed.data.departsAt;
  return c.json(await saveJourney(createDb(c.env), row), 201);
}

type EstimateSnap = {
  cost?: {
    energyPence?: { point?: number };
    chargesPence?: number;
    totalPence?: { point?: number; low?: number; high?: number };
  };
  hmrc?: { approvedPence?: number; ytdMiles?: number; crossedThreshold?: boolean };
  reasons?: string[];
  consumption?: { label?: string };
  origin?: { label?: string; lat?: number; lng?: number };
  destination?: { label?: string; lat?: number; lng?: number };
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
    createdAt: j.created_at,
  };
}

export async function listJourneysHandler(c: BrimContext) {
  const tenant = brimTenant(c);
  const db = createDb(c.env);
  const limit = Number(c.req.query('limit') ?? 50);
  const vehicles = await listVehicles(db, tenant);
  const names = new Map(vehicles.map((v) => [v.id, v.nickname ?? [v.make, v.model].filter(Boolean).join(' ')]));
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
  const db = createDb(c.env);
  const nowIso = new Date().toISOString();
  const yearStart = ukTaxYearStartUtc(nowIso);
  const rows = (await listJourneys(db, tenant)).filter(
    (j) => j.created_at >= yearStart && j.created_at <= nowIso,
  );
  const miles = await ytdMiles(db, tenant, yearStart, nowIso);
  const actualPence = rows.reduce((sum, j) => sum + (snap(j).cost?.totalPence?.point ?? 0), 0);
  const hmrc = hmrcAmapPence(miles, 0);
  return c.json({
    taxYearStart: yearStart,
    miles,
    actualPence,
    approvedPence: hmrc.approvedPence,
    crossedThreshold: miles > 10_000,
  });
}

export async function getJourneyHandler(c: BrimContext) {
  const tenant = brimTenant(c);
  const db = createDb(c.env);
  const row = await getJourney(db, tenant, c.req.param('id') ?? '');
  if (!row) return c.json({ error: 'not_found' }, 404);
  const estimate = snap(row);
  let vehicleNickname: string | undefined;
  if (row.vehicle_id) {
    const vehicles = await listVehicles(db, tenant);
    const match = vehicles.find((v) => v.id === row.vehicle_id);
    vehicleNickname = match?.nickname ?? [match?.make, match?.model].filter(Boolean).join(' ');
  }
  return c.json({
    ...listItem(row, vehicleNickname),
    durationSeconds: row.duration_seconds,
    departsAt: row.departs_at,
    estimate: row.estimate_json,
    reasons: estimate.reasons ?? [],
    consumptionLabel: estimate.consumption?.label,
    originPin: estimate.origin,
    destinationPin: estimate.destination,
    totalLowPence: estimate.cost?.totalPence?.low,
    totalHighPence: estimate.cost?.totalPence?.high,
    hmrc: estimate.hmrc,
  });
}

export async function deleteJourneyHandler(c: BrimContext) {
  const tenant = brimTenant(c);
  if (!(await deleteJourney(createDb(c.env), tenant, c.req.param('id') ?? '')))
    return c.json({ error: 'not_found' }, 404);
  return c.json({ ok: true });
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

export async function exportJourneysHandler(c: BrimContext) {
  const tenant = brimTenant(c);
  const rows = await listJourneys(createDb(c.env), tenant);
  const header =
    'date,from,to,miles,vehicle,energy cost,charges,total,HMRC approved amount,difference';
  const lines = rows.map((j) => {
    const estimate = j.estimate_json as {
      cost: { energyPence: { point: number }; chargesPence: number; totalPence: { point: number } };
      hmrc?: { approvedPence: number };
    };
    const miles = (j.distance_meters / 1609.344).toFixed(1);
    const energy = (estimate.cost.energyPence.point / 100).toFixed(2);
    const charges = (estimate.cost.chargesPence / 100).toFixed(2);
    const total = (estimate.cost.totalPence.point / 100).toFixed(2);
    const hmrc = ((estimate.hmrc?.approvedPence ?? 0) / 100).toFixed(2);
    const diff = (
      (estimate.cost.totalPence.point - (estimate.hmrc?.approvedPence ?? 0)) /
      100
    ).toFixed(2);
    return [
      j.created_at.slice(0, 10),
      csvEscape(j.origin_label),
      csvEscape(j.dest_label),
      miles,
      j.vehicle_id ?? '',
      energy,
      charges,
      total,
      hmrc,
      diff,
    ].join(',');
  });
  const body = `\uFEFF${header}\n${lines.join('\n')}\n`;
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="journey-cost.csv"',
    },
  });
}
