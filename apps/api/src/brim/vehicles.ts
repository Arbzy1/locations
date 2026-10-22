import { z } from 'zod';
import {
  consumptionUnitSchema,
  normaliseVrm,
  propulsionSchema,
  testCycleSchema,
  vehicleKindSchema,
} from '@locations/brim/shared';
import type { Context } from 'hono';
import {
  deleteVehicle,
  getSettings,
  getVehicle,
  listTariffs,
  listVehicles,
  saveTariff,
  saveVehicle,
} from './db/repo';
import type { VehicleRow } from './db/rows';
import { decodeVrmKey, decryptVrm, encryptVrm, hashVrm } from './vrm-crypto';
import { brimTenant, createDb, type BrimContext } from "./context";
import type { Env } from "../env";

const vehicleBody = z.object({
  nickname: z.string().optional(),
  kind: vehicleKindSchema.default('car'),
  propulsion: propulsionSchema,
  make: z.string().optional(),
  model: z.string().optional(),
  derivative: z.string().optional(),
  transmission: z.string().optional(),
  year: z.number().int().optional(),
  engineCc: z.number().int().optional(),
  co2Gkm: z.number().int().optional(),
  tankLitres: z.number().optional(),
  batteryKwhUsable: z.number().optional(),
  euroStatus: z.string().optional(),
  euroStatusSource: z.enum(['dvla', 'derived']).optional(),
  officialConsumption: z.number().optional(),
  officialUnit: consumptionUnitSchema.optional(),
  officialCycle: testCycleSchema.optional(),
  vcaMatchId: z.string().optional(),
  hasHeatPump: z.boolean().optional(),
  vrm: z.string().optional(),
});

const tariffBody = z.object({
  kind: z.enum(['home', 'public']).default('home'),
  pencePerKwh: z.number(),
  offpeakPence: z.number().optional(),
  offpeakWindow: z.string().optional(),
  network: z.string().optional(),
  isDefault: z.boolean().optional(),
});

type VehicleBody = z.infer<typeof vehicleBody>;
type VehicleFields = {
  nickname?: string | undefined;
  kind?: VehicleRow['kind'] | undefined;
  propulsion?: VehicleRow['propulsion'] | undefined;
  make?: string | undefined;
  model?: string | undefined;
  derivative?: string | undefined;
  transmission?: string | undefined;
  year?: number | undefined;
  engineCc?: number | undefined;
  co2Gkm?: number | undefined;
  tankLitres?: number | undefined;
  batteryKwhUsable?: number | undefined;
  euroStatus?: string | undefined;
  euroStatusSource?: 'dvla' | 'derived' | undefined;
  officialConsumption?: number | undefined;
  officialUnit?: VehicleBody['officialUnit'] | undefined;
  officialCycle?: VehicleBody['officialCycle'] | undefined;
  vcaMatchId?: string | undefined;
  hasHeatPump?: boolean | undefined;
};

async function publicVehicle(
  env: Env,
  kind: 'anon' | 'user',
  row: VehicleRow,
  isDefault?: boolean,
) {
  const rest = { ...row };
  delete rest.vrm_hash;
  delete rest.vrm_encrypted;
  const body: Record<string, unknown> =
    isDefault === undefined ? { ...rest } : { ...rest, is_default: isDefault };
  if (kind === 'user' && row.vrm_encrypted) {
    const key = env.VRM_ENCRYPTION_KEY ? decodeVrmKey(env.VRM_ENCRYPTION_KEY) : undefined;
    if (key) {
      const vrm = await decryptVrm(key, row.vrm_encrypted);
      if (vrm) body.vrm = vrm;
    }
  }
  return body;
}

async function attachVrm(
  env: Env,
  kind: 'anon' | 'user',
  row: VehicleRow,
  vrm: string | undefined,
): Promise<VehicleRow | { error: 'invalid_vrm' }> {
  if (vrm === undefined) return row;
  const normalised = normaliseVrm(vrm);
  if (!normalised) return { error: 'invalid_vrm' };
  if (kind !== 'user') return row;
  const key = env.VRM_ENCRYPTION_KEY ? decodeVrmKey(env.VRM_ENCRYPTION_KEY) : undefined;
  if (!key) return row;
  const next = { ...row };
  next.vrm_hash = await hashVrm(key, normalised);
  next.vrm_encrypted = await encryptVrm(key, normalised);
  return next;
}

function applyVehicleFields(row: VehicleRow, data: VehicleFields): VehicleRow {
  const next: VehicleRow = { ...row };
  if (data.nickname) next.nickname = data.nickname;
  if (data.kind) next.kind = data.kind;
  if (data.propulsion) next.propulsion = data.propulsion;
  if (data.make) next.make = data.make;
  if (data.model) next.model = data.model;
  if (data.derivative) next.derivative = data.derivative;
  if (data.transmission) next.transmission = data.transmission;
  if (data.year !== undefined) next.year = data.year;
  if (data.engineCc !== undefined) next.engine_cc = data.engineCc;
  if (data.co2Gkm !== undefined) next.co2_gkm = data.co2Gkm;
  if (data.tankLitres !== undefined) next.tank_litres = data.tankLitres;
  if (data.batteryKwhUsable !== undefined) next.battery_kwh_usable = data.batteryKwhUsable;
  if (data.euroStatus) next.euro_status = data.euroStatus;
  if (data.euroStatusSource) next.euro_status_source = data.euroStatusSource;
  if (data.officialConsumption !== undefined) next.official_consumption = data.officialConsumption;
  if (data.officialUnit) next.official_unit = data.officialUnit;
  if (data.officialCycle) next.official_cycle = data.officialCycle;
  if (data.vcaMatchId) next.vca_match_id = data.vcaMatchId;
  if (data.hasHeatPump !== undefined) next.has_heat_pump = data.hasHeatPump;
  return next;
}

export async function listVehiclesHandler(c: BrimContext) {
  const tenant = brimTenant(c);
  const db = createDb(c.env);
  const settings = await getSettings(db, tenant);
  const vehicles = await listVehicles(db, tenant);
  return c.json({
    vehicles: await Promise.all(
      vehicles.map((v) => publicVehicle(c.env, "user", v, settings?.default_vehicle_id === v.id)),
    ),
  });
}

export async function createVehicleHandler(c: BrimContext) {
  const tenant = brimTenant(c);
  const parsed = vehicleBody.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
  const { vrm, ...fields } = parsed.data;
  const row = applyVehicleFields(
    {
      id: crypto.randomUUID(),
      tenant: tenant,
      kind: parsed.data.kind,
      propulsion: parsed.data.propulsion,
      created_at: new Date().toISOString(),
    },
    fields,
  );
  const stored = await attachVrm(c.env, "user", row, vrm);
  if ('error' in stored) return c.json({ error: 'invalid_vrm' }, 400);
  return c.json(await publicVehicle(c.env, "user", await saveVehicle(createDb(c.env), stored)), 201);
}

export async function patchVehicleHandler(c: BrimContext) {
  const tenant = brimTenant(c);
  const db = createDb(c.env);
  const existing = await getVehicle(db, tenant, c.req.param('id') ?? '');
  if (!existing) return c.json({ error: 'not_found' }, 404);
  const parsed = vehicleBody.partial().safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
  const { vrm, ...fields } = parsed.data;
  const next = applyVehicleFields(existing, fields);
  const stored = await attachVrm(c.env, "user", next, vrm);
  if ('error' in stored) return c.json({ error: 'invalid_vrm' }, 400);
  return c.json(await publicVehicle(c.env, "user", await saveVehicle(db, stored)));
}

export async function deleteVehicleHandler(c: BrimContext) {
  const tenant = brimTenant(c);
  if (!(await deleteVehicle(createDb(c.env), tenant, c.req.param('id') ?? '')))
    return c.json({ error: 'not_found' }, 404);
  return c.json({ ok: true });
}

export async function listTariffsHandler(c: BrimContext) {
  const tenant = brimTenant(c);
  const db = createDb(c.env);
  const vehicleId = c.req.param('id') ?? '';
  if (!(await getVehicle(db, tenant, vehicleId))) return c.json({ error: 'not_found' }, 404);
  return c.json({ tariffs: await listTariffs(db, tenant, vehicleId) });
}

export async function createTariffHandler(c: BrimContext) {
  const tenant = brimTenant(c);
  const db = createDb(c.env);
  const vehicleId = c.req.param('id') ?? '';
  // Ownership before validation so another tenant's id is a 404, never a 400 probe.
  if (!(await getVehicle(db, tenant, vehicleId))) return c.json({ error: 'not_found' }, 404);
  const parsed = tariffBody.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
  const row = await saveTariff(db, tenant, {
    id: crypto.randomUUID(),
    vehicle_id: vehicleId,
    kind: parsed.data.kind,
    pence_per_kwh: parsed.data.pencePerKwh,
    is_default: parsed.data.isDefault ?? true,
    ...(parsed.data.offpeakPence !== undefined ? { offpeak_pence: parsed.data.offpeakPence } : {}),
    ...(parsed.data.offpeakWindow ? { offpeak_window: parsed.data.offpeakWindow } : {}),
    ...(parsed.data.network ? { network: parsed.data.network } : {}),
  });
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json(row, 201);
}
