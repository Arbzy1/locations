/** HMRC Approved Mileage Allowance Payments. Threshold is per tax year. */

export const HMRC_AMAP_THRESHOLD_MILES = 10_000;
export const HMRC_AMAP_PENCE_FIRST = 45;
export const HMRC_AMAP_PENCE_AFTER = 25;

export function ukTaxYearStartUtc(nowIso: string): string {
  const now = new Date(nowIso);
  const year = now.getUTCMonth() > 3 || (now.getUTCMonth() === 3 && now.getUTCDate() >= 6) ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return `${year}-04-06T00:00:00.000Z`;
}

export function hmrcAmapPence(journeyMiles: number, ytdMilesBefore: number): {
  approvedPence: number;
  bandMiles45: number;
  bandMiles25: number;
  crossedThreshold: boolean;
} {
  const remainingAtFirst = Math.max(0, HMRC_AMAP_THRESHOLD_MILES - ytdMilesBefore);
  const bandMiles45 = Math.min(journeyMiles, remainingAtFirst);
  const bandMiles25 = Math.max(0, journeyMiles - remainingAtFirst);
  return {
    approvedPence: bandMiles45 * HMRC_AMAP_PENCE_FIRST + bandMiles25 * HMRC_AMAP_PENCE_AFTER,
    bandMiles45,
    bandMiles25,
    crossedThreshold: bandMiles45 > 0 && bandMiles25 > 0,
  };
}
