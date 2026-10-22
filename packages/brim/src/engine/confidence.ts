import type { ConsumptionTier } from '../shared/index.js';

const TIER_HALF_WIDTH: Record<ConsumptionTier, number> = {
  0: 0.04,
  1: 0.08,
  2: 0.1,
  3: 0.2,
  4: 0.25,
};

export function bandWidth(tier: ConsumptionTier, fallbacks: number): number {
  return TIER_HALF_WIDTH[tier] + fallbacks * 0.03;
}

/** High interval scatter is one extra fallback. Still tier 0; the £ band just widens. */
export const CALIBRATION_CV_FALLBACK = 0.15;

export function extraFallbacksFromCalibration(
  calibration: { value: number; stddev?: number | undefined } | undefined,
): number {
  if (!calibration || calibration.stddev === undefined || !(calibration.value > 0)) return 0;
  return calibration.stddev / calibration.value > CALIBRATION_CV_FALLBACK ? 1 : 0;
}

export function applyBand(point: number, halfWidth: number): { point: number; low: number; high: number } {
  return {
    point,
    low: point * (1 - halfWidth),
    high: point * (1 + halfWidth),
  };
}
