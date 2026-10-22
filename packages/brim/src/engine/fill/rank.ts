import type { LatLng } from '../../shared/index.js';
import { perpendicularMetersToPolyline } from '../../shared/index.js';

export const DEFAULT_TANK_LITRES = 55;
export const DEFAULT_REMAINING_FRACTION = 0.25;
export const FILL_HASSLE_PENCE = 80;
export const MIN_FILL_SAVING_PENCE = 100;
export const DEFAULT_MAX_PERPENDICULAR_METERS = 1500;
export const CHEAPEST_FILL_CAP = 8;

export type FillCandidate = {
  stationId: string;
  lat: number;
  lng: number;
  pencePerLitre: number;
};

export type RankedFill = {
  stationId: string;
  fillPence: number;
  detourKm: number;
  detourPence: number;
  totalPence: number;
  savingPence: number;
  perpendicularMeters: number;
};

export type RankCheapestFillInput = {
  candidates: FillCandidate[];
  polyline: LatLng[];
  litresToFill: number;
  pencePerKm: number;
  baselinePencePerLitre: number;
  maxPerpendicularMeters?: number;
  hasslePence?: number;
  cap?: number;
};

export type RankCheapestFillResult = {
  stations: RankedFill[];
  reasons: string[];
  baselineFillPence: number;
  litresToFill: number;
  hasslePence: number;
};

export function litresToFill(tankLitres?: number, remainingLitres?: number): number {
  const tank = tankLitres !== undefined && tankLitres > 0 ? tankLitres : DEFAULT_TANK_LITRES;
  const remaining =
    remainingLitres !== undefined ? remainingLitres : tank * DEFAULT_REMAINING_FRACTION;
  return Math.max(0, tank - remaining);
}

export function pencePerKmFromConsumption(lPer100km: number, pencePerLitre: number): number {
  return (lPer100km / 100) * pencePerLitre;
}

export function rankCheapestFill(input: RankCheapestFillInput): RankCheapestFillResult {
  const hasslePence = input.hasslePence ?? FILL_HASSLE_PENCE;
  const maxPerp = input.maxPerpendicularMeters ?? DEFAULT_MAX_PERPENDICULAR_METERS;
  const cap = input.cap ?? CHEAPEST_FILL_CAP;
  const reasons: string[] = [];
  const litres = input.litresToFill;
  const baselineFillPence = litres * input.baselinePencePerLitre;

  if (litres <= 0) {
    reasons.push("Assumed remaining fuel fills the tank, so there is nothing to buy.");
    return { stations: [], reasons, baselineFillPence, litresToFill: litres, hasslePence };
  }

  reasons.push(
    `Assumed a ${litres.toFixed(1)} L fill (tank minus remaining). Detour is twice the straight-line offset plus ${hasslePence} p hassle.`,
  );

  const seen = new Set<string>();
  const ranked: RankedFill[] = [];
  for (const candidate of input.candidates) {
    if (seen.has(candidate.stationId)) continue;
    seen.add(candidate.stationId);
    if (!(candidate.pencePerLitre > 0)) continue;
    const perpendicularMeters = perpendicularMetersToPolyline(
      { lat: candidate.lat, lng: candidate.lng },
      input.polyline,
    );
    if (perpendicularMeters > maxPerp) continue;
    const detourKm = (2 * perpendicularMeters) / 1000;
    const detourPence = detourKm * input.pencePerKm + hasslePence;
    const fillPence = litres * candidate.pencePerLitre;
    const totalPence = fillPence + detourPence;
    const savingPence = baselineFillPence - totalPence;
    if (savingPence < MIN_FILL_SAVING_PENCE) continue;
    ranked.push({
      stationId: candidate.stationId,
      fillPence,
      detourKm,
      detourPence,
      totalPence,
      savingPence,
      perpendicularMeters,
    });
  }

  ranked.sort((a, b) => b.savingPence - a.savingPence);
  return {
    stations: ranked.slice(0, cap),
    reasons,
    baselineFillPence,
    litresToFill: litres,
    hasslePence,
  };
}
