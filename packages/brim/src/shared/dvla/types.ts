import type { Propulsion } from "../types.js";

/** Current UK format: two letters, two digits, three letters. */
export const CURRENT_UK_VRM = /^[A-Z]{2}[0-9]{2}[A-Z]{3}$/;

export const JOIN_CC_TOLERANCE = 50;
export const JOIN_CO2_TOLERANCE = 5;
export const JOIN_MAX_USEFUL = 6;
export const JOIN_OVERFLOW = 7;

export const DVLA_VES_ORIGIN = "https://driver-vehicle-licensing.api.gov.uk";

export type VesVehicle = {
  make: string;
  year?: number;
  propulsion: Propulsion;
  engineCc?: number;
  co2Gkm?: number;
  euroStatus?: string;
};

export type VesParseSkip = { reason: "not-found" | "invalid-body" | "unknown-fuel" };

export type JoinOutcome = "single" | "few" | "none";
