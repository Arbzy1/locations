/** HMRC Approved Mileage Allowance Payments. Threshold is per tax year. */

import type { VehicleKind } from "./types.js";

export const HMRC_AMAP_THRESHOLD_MILES = 10_000;
export const HMRC_AMAP_PENCE_FIRST = 45;
export const HMRC_AMAP_PENCE_AFTER = 25;
export const HMRC_AMAP_MOTORCYCLE_PENCE = 24;
export const HMRC_AMAP_PASSENGER_PENCE = 5;

export type HmrcAmapOptions = {
  kind?: VehicleKind | undefined;
  passengers?: number | undefined;
};

export function ukTaxYearStartUtc(nowIso: string): string {
  const now = new Date(nowIso);
  const year =
    now.getUTCMonth() > 3 || (now.getUTCMonth() === 3 && now.getUTCDate() >= 6)
      ? now.getUTCFullYear()
      : now.getUTCFullYear() - 1;
  return `${year}-04-06T00:00:00.000Z`;
}

export function hmrcAmapPence(
  journeyMiles: number,
  ytdMilesBefore: number,
  opts?: HmrcAmapOptions,
): {
  approvedPence: number;
  bandMiles45: number;
  bandMiles25: number;
  motorcycleMiles?: number;
  passengerPence?: number;
  crossedThreshold: boolean;
} {
  const passengers = Math.max(0, Math.floor(opts?.passengers ?? 0));
  const passengerPence = passengers > 0 ? journeyMiles * HMRC_AMAP_PASSENGER_PENCE * passengers : 0;

  if (opts?.kind === "motorcycle") {
    return {
      approvedPence: journeyMiles * HMRC_AMAP_MOTORCYCLE_PENCE + passengerPence,
      bandMiles45: 0,
      bandMiles25: 0,
      motorcycleMiles: journeyMiles,
      ...(passengerPence > 0 ? { passengerPence } : {}),
      crossedThreshold: false,
    };
  }

  const remainingAtFirst = Math.max(0, HMRC_AMAP_THRESHOLD_MILES - ytdMilesBefore);
  const bandMiles45 = Math.min(journeyMiles, remainingAtFirst);
  const bandMiles25 = Math.max(0, journeyMiles - remainingAtFirst);
  return {
    approvedPence:
      bandMiles45 * HMRC_AMAP_PENCE_FIRST +
      bandMiles25 * HMRC_AMAP_PENCE_AFTER +
      passengerPence,
    bandMiles45,
    bandMiles25,
    ...(passengerPence > 0 ? { passengerPence } : {}),
    crossedThreshold: bandMiles45 > 0 && bandMiles25 > 0,
  };
}
