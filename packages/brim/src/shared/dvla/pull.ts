import { mapDvlaFuel } from "./normalise.js";
import { DVLA_VES_ORIGIN, type VesParseSkip, type VesVehicle } from "./types.js";

export function dvlaVesUrl(): string {
  return `${DVLA_VES_ORIGIN}/vehicle-enquiry/v1/vehicles`;
}

export function dvlaVesHeaders(apiKey: string): Record<string, string> {
  return {
    "x-api-key": apiKey,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

export function dvlaVesBody(vrm: string): { registrationNumber: string } {
  return { registrationNumber: vrm };
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

/** Parse a VES JSON body. Never copies the registration number onto the result. */
export function parseVesJson(json: unknown): VesVehicle | VesParseSkip {
  if (!json || typeof json !== "object") return { reason: "invalid-body" };
  const rec = json as Record<string, unknown>;
  const make = asString(rec.make);
  if (!make) return { reason: "invalid-body" };
  const propulsion = mapDvlaFuel(asString(rec.fuelType));
  if (!propulsion) return { reason: "unknown-fuel" };
  const ves: VesVehicle = { make, propulsion };
  const year = asNumber(rec.yearOfManufacture);
  if (year !== undefined) ves.year = Math.round(year);
  const engineCc = asNumber(rec.engineCapacity);
  if (engineCc !== undefined && engineCc > 0) ves.engineCc = Math.round(engineCc);
  const co2 = asNumber(rec.co2Emissions);
  if (co2 !== undefined) ves.co2Gkm = Math.round(co2);
  const euro = asString(rec.euroStatus);
  if (euro) ves.euroStatus = euro;
  return ves;
}
