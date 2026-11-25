import { z } from "zod";
import {
  consumptionUnitSchema,
  normaliseVrm,
  propulsionSchema,
  testCycleSchema,
  vehicleKindSchema,
} from "@locations/brim/shared";
import {
  deleteTariff,
  deleteVehicle,
  getSettings,
  getTariff,
  getVehicle,
  listTariffs,
  listVehicles,
  saveTariff,
  saveVehicle,
} from "./db/repo";
import type { TariffRow, VehicleRow } from "./db/rows";
import { decodeVrmKey, decryptVrm, encryptVrm, hashVrm } from "./vrm-crypto";
import { brimTenant, requestBrimDb, type BrimContext } from "./context";
import type { Env } from "../env";

const vehicleBody = z.object({
  nickname: z.string().nullable().optional(),
  kind: vehicleKindSchema.default("car"),
  propulsion: propulsionSchema,
  make: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  derivative: z.string().nullable().optional(),
  transmission: z.string().nullable().optional(),
  year: z.number().int().nullable().optional(),
  engineCc: z.number().int().nullable().optional(),
  co2Gkm: z.number().int().nullable().optional(),
  tankLitres: z.number().positive().nullable().optional(),
  batteryKwhUsable: z.number().positive().nullable().optional(),
  euroStatus: z.string().nullable().optional(),
  euroStatusSource: z.enum(["dvla", "derived"]).nullable().optional(),
  officialConsumption: z.number().positive().nullable().optional(),
  officialUnit: consumptionUnitSchema.nullable().optional(),
  officialCycle: testCycleSchema.nullable().optional(),
  userEnteredConsumption: z.number().positive().nullable().optional(),
  userEnteredUnit: consumptionUnitSchema.nullable().optional(),
  vcaMatchId: z.string().nullable().optional(),
  hasHeatPump: z.boolean().nullable().optional(),
  vrm: z.string().nullable().optional(),
});

const tariffBody = z.object({
  kind: z.enum(["home", "public"]).default("home"),
  pencePerKwh: z.number().positive(),
  offpeakPence: z.number().positive().nullable().optional(),
  offpeakWindow: z.string().nullable().optional(),
  network: z.string().nullable().optional(),
  isDefault: z.boolean().optional(),
});

const tariffPatchBody = z.object({
  kind: z.enum(["home", "public"]).optional(),
  pencePerKwh: z.number().positive().optional(),
  offpeakPence: z.number().positive().nullable().optional(),
  offpeakWindow: z.string().nullable().optional(),
  network: z.string().nullable().optional(),
  isDefault: z.boolean().optional(),
});

type VehicleFields = Omit<Partial<z.infer<typeof vehicleBody>>, "vrm">;

function hasValidVrmKey(env: Env): boolean {
  return Boolean(env.VRM_ENCRYPTION_KEY && decodeVrmKey(env.VRM_ENCRYPTION_KEY));
}

async function publicVehicle(
  env: Env,
  kind: "anon" | "user",
  row: VehicleRow,
  isDefault?: boolean,
  vrmProvided?: boolean,
) {
  const rest = { ...row };
  delete rest.vrm_hash;
  delete rest.vrm_encrypted;
  const body: Record<string, unknown> =
    isDefault === undefined ? { ...rest } : { ...rest, is_default: isDefault };
  if (row.official_cycle === "USER" && row.official_consumption !== undefined) {
    body.user_entered_consumption = row.official_consumption;
    if (row.official_unit) body.user_entered_unit = row.official_unit;
  }
  if (kind === "user" && row.vrm_encrypted) {
    const key = env.VRM_ENCRYPTION_KEY ? decodeVrmKey(env.VRM_ENCRYPTION_KEY) : undefined;
    if (key) {
      const vrm = await decryptVrm(key, row.vrm_encrypted);
      if (vrm) body.vrm = vrm;
    }
  }
  if (vrmProvided) {
    body.vrmStored = hasValidVrmKey(env);
  }
  return body;
}

async function attachVrm(
  env: Env,
  kind: "anon" | "user",
  row: VehicleRow,
  vrm: string | null | undefined,
): Promise<VehicleRow | { error: "invalid_vrm" }> {
  if (vrm === undefined) return row;
  if (vrm === null || vrm.trim() === "") {
    const cleared = { ...row };
    delete cleared.vrm_hash;
    delete cleared.vrm_encrypted;
    return cleared;
  }
  const normalised = normaliseVrm(vrm);
  if (!normalised) return { error: "invalid_vrm" };
  if (kind !== "user") return row;
  const key = env.VRM_ENCRYPTION_KEY ? decodeVrmKey(env.VRM_ENCRYPTION_KEY) : undefined;
  if (!key) return row;
  const next = { ...row };
  next.vrm_hash = await hashVrm(key, normalised);
  next.vrm_encrypted = await encryptVrm(key, normalised);
  return next;
}

function setOrClearString<K extends keyof VehicleRow>(
  target: VehicleRow,
  key: K,
  val: string | null | undefined,
) {
  if (val === undefined) return;
  const trimmed = val?.trim();
  if (val === null || !trimmed) {
    delete target[key];
  } else {
    (target as Record<string, unknown>)[key as string] = trimmed;
  }
}

function setOrClearNumber<K extends keyof VehicleRow>(
  target: VehicleRow,
  key: K,
  val: number | null | undefined,
) {
  if (val === undefined) return;
  if (val === null) {
    delete target[key];
  } else {
    (target as Record<string, unknown>)[key as string] = val;
  }
}

function applyVehicleFields(row: VehicleRow, data: VehicleFields): VehicleRow {
  const next: VehicleRow = { ...row };
  const prevEuro = row.euro_status;
  const prevEuroSource = row.euro_status_source;

  setOrClearString(next, "nickname", data.nickname);
  if (data.kind) next.kind = data.kind;
  if (data.propulsion) next.propulsion = data.propulsion;
  setOrClearString(next, "make", data.make);
  setOrClearString(next, "model", data.model);
  setOrClearString(next, "derivative", data.derivative);
  setOrClearString(next, "transmission", data.transmission);
  setOrClearNumber(next, "year", data.year);
  setOrClearNumber(next, "engine_cc", data.engineCc);
  setOrClearNumber(next, "co2_gkm", data.co2Gkm);
  setOrClearNumber(next, "tank_litres", data.tankLitres);
  setOrClearNumber(next, "battery_kwh_usable", data.batteryKwhUsable);
  setOrClearString(next, "vca_match_id", data.vcaMatchId);

  if (data.hasHeatPump === null) delete next.has_heat_pump;
  else if (data.hasHeatPump !== undefined) next.has_heat_pump = data.hasHeatPump;

  // Euro status & preserving DVLA provenance across unrelated edits
  if (data.euroStatus === null || (typeof data.euroStatus === "string" && !data.euroStatus.trim())) {
    delete next.euro_status;
    delete next.euro_status_source;
  } else if (data.euroStatus !== undefined) {
    const trimmedEuro = data.euroStatus.trim();
    next.euro_status = trimmedEuro;
    const unchanged =
      prevEuro !== undefined &&
      prevEuro.trim().toLowerCase() === trimmedEuro.toLowerCase();
    if (unchanged && prevEuroSource === "dvla" && data.euroStatusSource !== "dvla") {
      next.euro_status_source = "dvla";
    } else if (data.euroStatusSource) {
      next.euro_status_source = data.euroStatusSource;
    } else if (!unchanged && !next.euro_status_source) {
      next.euro_status_source = "derived";
    }
  } else if (data.euroStatusSource === null) {
    delete next.euro_status_source;
  } else if (data.euroStatusSource && prevEuroSource !== "dvla") {
    next.euro_status_source = data.euroStatusSource;
  }

  // Manual user-entered consumption vs brochure official consumption
  if (data.userEnteredConsumption === null) {
    if (next.official_cycle === "USER") {
      delete next.official_consumption;
      delete next.official_unit;
      delete next.official_cycle;
    }
  } else if (data.userEnteredConsumption !== undefined) {
    next.official_consumption = data.userEnteredConsumption;
    const defaultUnit =
      next.propulsion === "bev" ? "mi/kWh" : "mpg";
    next.official_unit = data.userEnteredUnit ?? next.official_unit ?? defaultUnit;
    next.official_cycle = "USER";
  } else {
    if (data.officialConsumption === null) {
      delete next.official_consumption;
      delete next.official_unit;
      delete next.official_cycle;
    } else if (data.officialConsumption !== undefined) {
      next.official_consumption = data.officialConsumption;
      if (data.officialUnit) next.official_unit = data.officialUnit;
      if (data.officialCycle) next.official_cycle = data.officialCycle;
      else if (next.official_cycle === "USER" || !next.official_cycle) next.official_cycle = "WLTP";
    } else {
      if (data.officialUnit === null) delete next.official_unit;
      else if (data.officialUnit) next.official_unit = data.officialUnit;
      if (data.officialCycle === null) delete next.official_cycle;
      else if (data.officialCycle) next.official_cycle = data.officialCycle;
    }
  }

  return next;
}

export async function listVehiclesHandler(c: BrimContext) {
  const tenant = brimTenant(c);
  const db = requestBrimDb(c);
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
  if (!parsed.success) return c.json({ error: "invalid_request" }, 400);
  const { vrm, ...fields } = parsed.data;
  const row = applyVehicleFields(
    {
      id: crypto.randomUUID(),
      tenant,
      kind: parsed.data.kind,
      propulsion: parsed.data.propulsion,
      created_at: new Date().toISOString(),
    },
    fields,
  );
  const stored = await attachVrm(c.env, "user", row, vrm);
  if ("error" in stored) return c.json({ error: "invalid_vrm" }, 400);
  const db = requestBrimDb(c);
  const saved = await saveVehicle(db, stored);
  const vrmSupplied = typeof vrm === "string" && vrm.trim().length > 0;
  return c.json(await publicVehicle(c.env, "user", saved, undefined, vrmSupplied), 201);
}

export async function patchVehicleHandler(c: BrimContext) {
  const tenant = brimTenant(c);
  const db = requestBrimDb(c);
  const existing = await getVehicle(db, tenant, c.req.param("id") ?? "");
  if (!existing) return c.json({ error: "not_found" }, 404);
  const parsed = vehicleBody.partial().safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "invalid_request" }, 400);
  const { vrm, ...fields } = parsed.data;
  const next = applyVehicleFields(existing, fields);
  const stored = await attachVrm(c.env, "user", next, vrm);
  if ("error" in stored) return c.json({ error: "invalid_vrm" }, 400);
  const saved = await saveVehicle(db, stored);
  const vrmSupplied = typeof vrm === "string" && vrm.trim().length > 0;
  return c.json(await publicVehicle(c.env, "user", saved, undefined, vrmSupplied));
}

export async function deleteVehicleHandler(c: BrimContext) {
  const tenant = brimTenant(c);
  if (!(await deleteVehicle(requestBrimDb(c), tenant, c.req.param("id") ?? ""))) {
    return c.json({ error: "not_found" }, 404);
  }
  return c.json({ ok: true });
}

export async function listTariffsHandler(c: BrimContext) {
  const tenant = brimTenant(c);
  const db = requestBrimDb(c);
  const vehicleId = c.req.param("id") ?? "";
  if (!(await getVehicle(db, tenant, vehicleId))) return c.json({ error: "not_found" }, 404);
  return c.json({ tariffs: await listTariffs(db, tenant, vehicleId) });
}

export async function createTariffHandler(c: BrimContext) {
  const tenant = brimTenant(c);
  const db = requestBrimDb(c);
  const vehicleId = c.req.param("id") ?? "";
  // Ownership before validation so another tenant's id is a 404, never a 400 probe.
  if (!(await getVehicle(db, tenant, vehicleId))) return c.json({ error: "not_found" }, 404);
  const parsed = tariffBody.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "invalid_request" }, 400);
  const row: TariffRow = {
    id: crypto.randomUUID(),
    vehicle_id: vehicleId,
    kind: parsed.data.kind,
    pence_per_kwh: parsed.data.pencePerKwh,
    is_default: parsed.data.isDefault ?? true,
  };
  if (parsed.data.offpeakPence !== null && parsed.data.offpeakPence !== undefined) {
    row.offpeak_pence = parsed.data.offpeakPence;
  }
  if (parsed.data.offpeakWindow?.trim()) row.offpeak_window = parsed.data.offpeakWindow.trim();
  if (parsed.data.network?.trim()) row.network = parsed.data.network.trim();
  const saved = await saveTariff(db, tenant, row);
  if (!saved) return c.json({ error: "not_found" }, 404);
  return c.json(saved, 201);
}

export async function patchTariffHandler(c: BrimContext) {
  const tenant = brimTenant(c);
  const db = requestBrimDb(c);
  const vehicleId = c.req.param("id") ?? "";
  const tariffId = c.req.param("tariffId") ?? "";
  const existing = await getTariff(db, tenant, vehicleId, tariffId);
  if (!existing) return c.json({ error: "not_found" }, 404);
  const parsed = tariffPatchBody.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "invalid_request" }, 400);
  const next: TariffRow = { ...existing };
  if (parsed.data.kind) next.kind = parsed.data.kind;
  if (parsed.data.pencePerKwh !== undefined) next.pence_per_kwh = parsed.data.pencePerKwh;
  if (parsed.data.isDefault !== undefined) next.is_default = parsed.data.isDefault;
  if (parsed.data.offpeakPence === null) delete next.offpeak_pence;
  else if (parsed.data.offpeakPence !== undefined) next.offpeak_pence = parsed.data.offpeakPence;
  if (parsed.data.offpeakWindow === null || parsed.data.offpeakWindow?.trim() === "") {
    delete next.offpeak_window;
  } else if (parsed.data.offpeakWindow !== undefined) {
    next.offpeak_window = parsed.data.offpeakWindow.trim();
  }
  if (parsed.data.network === null || parsed.data.network?.trim() === "") {
    delete next.network;
  } else if (parsed.data.network !== undefined) {
    next.network = parsed.data.network.trim();
  }
  const saved = await saveTariff(db, tenant, next);
  if (!saved) return c.json({ error: "not_found" }, 404);
  return c.json(saved);
}

export async function deleteTariffHandler(c: BrimContext) {
  const tenant = brimTenant(c);
  const db = requestBrimDb(c);
  const vehicleId = c.req.param("id") ?? "";
  const tariffId = c.req.param("tariffId") ?? "";
  if (!(await deleteTariff(db, tenant, vehicleId, tariffId))) {
    return c.json({ error: "not_found" }, 404);
  }
  return c.json({ ok: true });
}
