import { vcaToCatalogue } from "../vca/normalise.js";
import type { CatalogueVehicle, VcaVehicle } from "../vca/types.js";
import {
  JOIN_CC_TOLERANCE,
  JOIN_CO2_TOLERANCE,
  JOIN_MAX_USEFUL,
  JOIN_OVERFLOW,
  type JoinOutcome,
  type VesVehicle,
} from "./types.js";

function sameMake(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function within(actual: number | undefined, target: number | undefined, tol: number): boolean {
  if (actual === undefined || target === undefined) return true;
  return Math.abs(actual - target) <= tol;
}

export function joinVca(ves: VesVehicle, vehicles: readonly VcaVehicle[]): CatalogueVehicle[] {
  const skipCc = ves.propulsion === "bev" && ves.engineCc === undefined;
  const hits: VcaVehicle[] = [];
  for (const vehicle of vehicles) {
    if (!sameMake(vehicle.make, ves.make)) continue;
    if (vehicle.fuel !== ves.propulsion) continue;
    if (!skipCc && !within(vehicle.engineCc, ves.engineCc, JOIN_CC_TOLERANCE)) continue;
    if (!within(vehicle.co2Gkm, ves.co2Gkm, JOIN_CO2_TOLERANCE)) continue;
    hits.push(vehicle);
    if (hits.length >= JOIN_OVERFLOW) break;
  }
  if (hits.length > JOIN_MAX_USEFUL) return [];
  hits.sort((a, b) => {
    const co2A = ves.co2Gkm !== undefined && a.co2Gkm !== undefined ? Math.abs(a.co2Gkm - ves.co2Gkm) : 0;
    const co2B = ves.co2Gkm !== undefined && b.co2Gkm !== undefined ? Math.abs(b.co2Gkm - ves.co2Gkm) : 0;
    if (co2A !== co2B) return co2A - co2B;
    const ccA = ves.engineCc !== undefined && a.engineCc !== undefined ? Math.abs(a.engineCc - ves.engineCc) : 0;
    const ccB = ves.engineCc !== undefined && b.engineCc !== undefined ? Math.abs(b.engineCc - ves.engineCc) : 0;
    return ccA - ccB;
  });
  return hits.map((row) => vcaToCatalogue(row));
}

export function joinOutcome(count: number): JoinOutcome {
  if (count === 1) return "single";
  if (count >= 2 && count <= JOIN_MAX_USEFUL) return "few";
  return "none";
}
