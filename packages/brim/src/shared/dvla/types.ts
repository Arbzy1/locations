import type { Propulsion } from "../types.js";

/** Current UK format: two letters, two digits, three letters. */
export const CURRENT_UK_VRM = /^[A-Z]{2}[0-9]{2}[A-Z]{3}$/;

/**
 * Valid UK registration plate formats:
 * - Current (2001+): AB12CDE
 * - Prefix (1983-2001): A123BCD
 * - Suffix (1963-1983): ABC123D
 * - Dateless / Northern Ireland: A1, ABC1234, AZ1234, 1A, 1234ABC
 * - Diplomatic: 101D234, 101X234
 */
export const UK_VRM_PATTERN =
  /^(?:[A-Z]{2}[0-9]{2}[A-Z]{3}|[A-Z][0-9]{1,3}[A-Z]{3}|[A-Z]{3}[0-9]{1,3}[A-Z]|[A-Z]{1,3}[0-9]{1,4}|[0-9]{1,4}[A-Z]{1,3}|[0-9]{3}[DX][0-9]{3})$/;

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
