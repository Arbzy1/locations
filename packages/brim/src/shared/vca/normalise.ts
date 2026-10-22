import type { ConsumptionUnit, Propulsion, TestCycle } from "../types.js";
import { kwhPer100kmToMilesPerKwh } from "../units.js";
import { parseCsv } from "./csv.js";
import type { CatalogueVehicle, NormaliseResult, NormaliseSkip, VcaVehicle } from "./types.js";

const MAKE_ALIASES = ["manufacturer", "make", "manufacturer name"] as const;
const MODEL_ALIASES = ["model", "manufacturer model"] as const;
const DERIVATIVE_ALIASES = ["description", "derivative", "variant", "model description"] as const;
const TRANSMISSION_ALIASES = ["transmission", "transmission type", "manual or automatic"] as const;
const ENGINE_ALIASES = [
  "engine capacity",
  "engine capacity cc",
  "enginecapacity",
  "engine size",
  "capacity",
] as const;
const FUEL_ALIASES = ["fuel type", "fuel", "fueltype", "energy type"] as const;
const MPG_WLTP_ALIASES = ["wltp imperial combined", "wltp imperial combined mpg", "wltp combined imperial"] as const;
const MPG_WLTP_WEIGHTED_ALIASES = [
  "wltp imperial combined weighted",
  "wltp imperial combined weighted mpg",
] as const;
const L100_WLTP_ALIASES = ["wltp metric combined", "wltp combined metric"] as const;
const L100_WLTP_WEIGHTED_ALIASES = ["wltp metric combined weighted"] as const;
const MPG_NEDC_ALIASES = ["imperial combined", "imperial combined mpg", "combined imperial"] as const;
const L100_NEDC_ALIASES = ["metric combined", "combined metric", "metric combined l 100km"] as const;
const MI_KWH_ALIASES = [
  "electric energy consumption miles kwh",
  "miles kwh",
  "electric energy consumption mi kwh",
] as const;
const WH_KM_ALIASES = ["wh km", "electric energy consumption wh km", "wh km combined"] as const;
const CO2_ALIASES = ["co2 g km", "co2", "co2 emissions", "nedc co2", "wltp co2", "wltp co2 weighted"] as const;
const CYCLE_ALIASES = ["testing scheme", "test cycle", "emissions test"] as const;

const CONSUMPTION_ALIASES = [
  ...MPG_WLTP_ALIASES,
  ...MPG_WLTP_WEIGHTED_ALIASES,
  ...L100_WLTP_ALIASES,
  ...L100_WLTP_WEIGHTED_ALIASES,
  ...MPG_NEDC_ALIASES,
  ...L100_NEDC_ALIASES,
  ...MI_KWH_ALIASES,
  ...WH_KM_ALIASES,
];

export function assertVcaHeaders(headers: string[]): void {
  const set = new Set(headers);
  const has = (aliases: readonly string[]) => aliases.some((a) => set.has(a));
  const missing: string[] = [];
  if (!has(MAKE_ALIASES)) missing.push("make/manufacturer");
  if (!has(MODEL_ALIASES)) missing.push("model");
  if (!has(CONSUMPTION_ALIASES) && !has(FUEL_ALIASES)) missing.push("consumption or fuel type");
  if (!has(CONSUMPTION_ALIASES)) missing.push("combined mpg / kWh / Wh/km");
  if (missing.length > 0) {
    throw new Error(
      `VCA CSV is missing required columns (${missing.join(", ")}). Got: ${headers.join(", ") || "(none)"}`,
    );
  }
}

function first(record: Record<string, string>, aliases: readonly string[]): string | undefined {
  for (const key of aliases) {
    const value = record[key];
    if (value !== undefined && value !== "") return value;
  }
  return undefined;
}

export function parseNumber(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const t = raw.trim().replace(/,/g, "");
  if (!t || /^n\/?a$/i.test(t) || t === "-" || t === "*" || t === ".") return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

function positive(n: number | undefined): number | undefined {
  return n !== undefined && n > 0 ? n : undefined;
}

/**
 * Map a VCA fuel-type string onto Brim propulsion.
 * "Petrol Electric" is a non-plugin hybrid; "Electricity / Petrol" (and weighted combined) is PHEV.
 */
export function mapFuel(raw: string | undefined, hasWeightedCombined: boolean): Propulsion | undefined {
  if (!raw) return undefined;
  const f = raw.toLowerCase();
  if (/\b(lpg|cng|hydrogen|e85|bioethanol)\b/.test(f) && !/petrol|diesel|electric/.test(f)) {
    return undefined;
  }
  const hasElectric = /electric/.test(f);
  const hasPetrol = /petrol/.test(f);
  const hasDiesel = /diesel/.test(f);
  if (hasElectric && !hasPetrol && !hasDiesel) return "bev";
  if (hasElectric && (hasPetrol || hasDiesel)) {
    if (/plug/.test(f) || /phev/.test(f) || hasWeightedCombined) return "phev";
    if (/electricity\s*\/\s*(petrol|diesel)/.test(f)) return "phev";
    if (/(petrol|diesel)\s*\/\s*electricity/.test(f) && !/hybrid/.test(f)) return "phev";
    return "hybrid";
  }
  if (hasDiesel && !hasPetrol) return "diesel";
  if (hasPetrol) return "petrol";
  return undefined;
}

function hintCycle(raw: string | undefined): TestCycle | undefined {
  if (!raw) return undefined;
  const t = raw.toLowerCase();
  if (t.includes("wltp")) return "WLTP";
  if (t.includes("nedc")) return "NEDC";
  return undefined;
}

function slugPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** FNV-1a 64-bit, hex. Stable across syncs so saved `vca_match_id` keeps working. */
export function fnv1a64(input: string): string {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < input.length; i++) {
    h ^= BigInt(input.charCodeAt(i));
    h = (h * prime) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, "0");
}

export function catalogueId(parts: {
  make: string;
  model: string;
  derivative?: string;
  transmission?: string;
  engineCc?: number;
  fuel: Propulsion;
  cycle: TestCycle;
}): string {
  const key = [
    slugPart(parts.make),
    slugPart(parts.model),
    slugPart(parts.derivative ?? ""),
    slugPart(parts.transmission ?? ""),
    parts.engineCc === undefined ? "" : String(parts.engineCc),
    parts.fuel,
    parts.cycle,
  ].join("|");
  return `vca_${fnv1a64(key)}`;
}

type ConsumptionPick = { value: number; unit: ConsumptionUnit; cycle: TestCycle };

function pickConsumption(
  record: Record<string, string>,
  fuel: Propulsion,
): ConsumptionPick | undefined {
  const mpgWltpWeighted = positive(parseNumber(first(record, MPG_WLTP_WEIGHTED_ALIASES)));
  const mpgWltp = positive(parseNumber(first(record, MPG_WLTP_ALIASES)));
  const l100WltpWeighted = positive(parseNumber(first(record, L100_WLTP_WEIGHTED_ALIASES)));
  const l100Wltp = positive(parseNumber(first(record, L100_WLTP_ALIASES)));
  const mpgNedc = positive(parseNumber(first(record, MPG_NEDC_ALIASES)));
  const l100Nedc = positive(parseNumber(first(record, L100_NEDC_ALIASES)));
  const miKwh = positive(parseNumber(first(record, MI_KWH_ALIASES)));
  const whKm = positive(parseNumber(first(record, WH_KM_ALIASES)));
  const hinted = hintCycle(first(record, CYCLE_ALIASES));

  if (fuel === "bev") {
    if (miKwh !== undefined) return { value: miKwh, unit: "mi/kWh", cycle: hinted ?? "WLTP" };
    if (whKm !== undefined) {
      const kwh100 = whKm / 10;
      return { value: kwhPer100kmToMilesPerKwh(kwh100), unit: "mi/kWh", cycle: hinted ?? "WLTP" };
    }
    return undefined;
  }

  if (mpgWltpWeighted !== undefined) return { value: mpgWltpWeighted, unit: "mpg", cycle: "WLTP" };
  if (mpgWltp !== undefined) return { value: mpgWltp, unit: "mpg", cycle: "WLTP" };
  if (l100WltpWeighted !== undefined) return { value: l100WltpWeighted, unit: "l/100km", cycle: "WLTP" };
  if (l100Wltp !== undefined) return { value: l100Wltp, unit: "l/100km", cycle: "WLTP" };
  if (mpgNedc !== undefined) return { value: mpgNedc, unit: "mpg", cycle: hinted ?? "NEDC" };
  if (l100Nedc !== undefined) return { value: l100Nedc, unit: "l/100km", cycle: hinted ?? "NEDC" };
  return undefined;
}

export function normaliseVcaRow(
  record: Record<string, string>,
  datasetVersion: string,
): { vehicle: VcaVehicle } | { skip: NormaliseSkip } {
  const make = first(record, MAKE_ALIASES)?.trim();
  const model = first(record, MODEL_ALIASES)?.trim();
  if (!make || !model) {
    const skip: NormaliseSkip = { reason: "missing make or model" };
    if (make) skip.make = make;
    if (model) skip.model = model;
    return { skip };
  }

  const mpgWltpWeighted = positive(parseNumber(first(record, MPG_WLTP_WEIGHTED_ALIASES)));
  const l100WltpWeighted = positive(parseNumber(first(record, L100_WLTP_WEIGHTED_ALIASES)));
  const hasWeighted = mpgWltpWeighted !== undefined || l100WltpWeighted !== undefined;
  const fuelRaw = first(record, FUEL_ALIASES);
  const fuel = mapFuel(fuelRaw, hasWeighted);
  if (!fuel) {
    const skip: NormaliseSkip = { reason: `unknown fuel: ${fuelRaw ?? "(empty)"}` };
    skip.make = make;
    skip.model = model;
    return { skip };
  }

  const consumption = pickConsumption(record, fuel);
  if (!consumption) {
    return { skip: { reason: "missing combined consumption", make, model } };
  }

  const derivative = first(record, DERIVATIVE_ALIASES)?.trim();
  const transmission = first(record, TRANSMISSION_ALIASES)?.trim();
  const engineCcRaw = parseNumber(first(record, ENGINE_ALIASES));
  const engineCc = engineCcRaw !== undefined ? Math.round(engineCcRaw) : undefined;
  const co2Raw = parseNumber(first(record, CO2_ALIASES));
  const co2Gkm = co2Raw !== undefined ? Math.round(co2Raw) : undefined;

  const vehicle: VcaVehicle = {
    id: catalogueId({
      make,
      model,
      ...(derivative ? { derivative } : {}),
      ...(transmission ? { transmission } : {}),
      ...(engineCc !== undefined ? { engineCc } : {}),
      fuel,
      cycle: consumption.cycle,
    }),
    make,
    model,
    fuel,
    consumptionCombined: consumption.value,
    unit: consumption.unit,
    cycle: consumption.cycle,
    datasetVersion,
  };
  if (derivative) vehicle.derivative = derivative;
  if (transmission) vehicle.transmission = transmission;
  if (engineCc !== undefined && engineCc > 0) vehicle.engineCc = engineCc;
  if (co2Gkm !== undefined && co2Gkm >= 0) vehicle.co2Gkm = co2Gkm;
  return { vehicle };
}

export function normaliseVcaRecords(
  records: Record<string, string>[],
  datasetVersion: string,
): NormaliseResult {
  const vehicles: VcaVehicle[] = [];
  const skipped: NormaliseSkip[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    const result = normaliseVcaRow(record, datasetVersion);
    if ("skip" in result) {
      skipped.push(result.skip);
      continue;
    }
    if (seen.has(result.vehicle.id)) continue;
    seen.add(result.vehicle.id);
    vehicles.push(result.vehicle);
  }
  return { vehicles, skipped };
}

export function normaliseVcaCsv(csvText: string, datasetVersion: string): NormaliseResult {
  const { headers, records } = parseCsv(csvText);
  assertVcaHeaders(headers);
  return normaliseVcaRecords(records, datasetVersion);
}

export function vcaToCatalogue(vehicle: VcaVehicle): CatalogueVehicle {
  const row: CatalogueVehicle = {
    id: vehicle.id,
    make: vehicle.make,
    model: vehicle.model,
    propulsion: vehicle.fuel,
    officialConsumption: vehicle.consumptionCombined,
    officialUnit: vehicle.unit,
    officialCycle: vehicle.cycle,
  };
  if (vehicle.derivative) row.derivative = vehicle.derivative;
  if (vehicle.transmission) row.transmission = vehicle.transmission;
  if (vehicle.engineCc !== undefined) row.engineCc = vehicle.engineCc;
  if (vehicle.co2Gkm !== undefined) row.co2Gkm = vehicle.co2Gkm;
  return row;
}
