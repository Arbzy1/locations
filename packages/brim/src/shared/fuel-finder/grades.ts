import type { Propulsion } from "../types.js";
import type { FuelGrade } from "./types.js";

const GRADE_MAP: Record<string, FuelGrade> = {
  E10: "E10",
  E5: "E5",
  B7_STANDARD: "B7",
  B7: "B7",
  B7_PREMIUM: "SDV",
  SDV: "SDV",
  LPG: "LPG",
};

export function mapFuelFinderGrade(fuelType: string | null | undefined): FuelGrade | undefined {
  if (!fuelType) return undefined;
  return GRADE_MAP[fuelType.trim().toUpperCase()];
}

/** Liquid Fuel Finder grade for an estimate. BEV has no liquid grade. */
export function gradeForPropulsion(propulsion: Propulsion): FuelGrade | undefined {
  if (propulsion === "bev") return undefined;
  if (propulsion === "diesel") return "B7";
  return "E10";
}
