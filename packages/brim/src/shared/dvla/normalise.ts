import type { Propulsion } from "../types.js";
import { CURRENT_UK_VRM } from "./types.js";

export function normaliseVrm(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const vrm = raw.toUpperCase().replace(/\s+/g, "");
  return CURRENT_UK_VRM.test(vrm) ? vrm : undefined;
}

/** DVLA VES fuelType. Not VCA mapFuel: "HYBRID ELECTRIC" would otherwise become BEV. */
export function mapDvlaFuel(raw: string | undefined): Propulsion | undefined {
  if (!raw) return undefined;
  const f = raw.trim().toUpperCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (f === "PETROL") return "petrol";
  if (f === "DIESEL") return "diesel";
  if (f === "ELECTRICITY" || f === "ELECTRIC") return "bev";
  if (f === "HYBRID ELECTRIC" || f === "HYBRID") return "hybrid";
  if (f === "PETROL/ELECTRIC" || f === "PETROL ELECTRIC") return "phev";
  if (f === "DIESEL/ELECTRIC" || f === "DIESEL ELECTRIC") return "phev";
  return undefined;
}
