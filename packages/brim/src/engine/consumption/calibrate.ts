import { milesToKm } from '../../shared/index.js';

/** Intervals shorter than this are treated as odometer noise, not a sample. */
export const MIN_INTERVAL_MILES = 20;

export type FillUpSample = {
  odometerMiles: number;
  quantity: number;
  unit: "litres" | "kwh";
  filledToBrim: boolean;
  occurredAt?: string;
};

export type CalibrationFromFillUps = {
  value: number;
  unit: "l/100km" | "kWh/100km";
  sampleCount: number;
  stddev?: number;
};

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function sampleStddev(values: number[]): number | undefined {
  if (values.length < 2) return undefined;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function sortFillUps(samples: FillUpSample[]): FillUpSample[] {
  return samples.slice().sort((a, b) => {
    if (a.occurredAt && b.occurredAt && a.occurredAt !== b.occurredAt) {
      return a.occurredAt < b.occurredAt ? -1 : 1;
    }
    return a.odometerMiles - b.odometerMiles;
  });
}

/**
 * Brim-to-brim (or charge-to-full) intervals. Non-brim fills between two brim
 * endpoints contribute quantity but cannot start or end an interval. A later
 * fill with a lower odometer is dropped as corrupt.
 */
export function calibrateFromFillUps(
  samples: FillUpSample[],
  kind: "liquid" | "electric",
): CalibrationFromFillUps | undefined {
  const wantUnit = kind === "electric" ? "kwh" : "litres";
  const unit = kind === "electric" ? "kWh/100km" : "l/100km";
  const sorted = sortFillUps(
    samples.filter((s) => s.quantity > 0 && s.unit === wantUnit && Number.isFinite(s.odometerMiles)),
  );
  const usable: FillUpSample[] = [];
  for (const sample of sorted) {
    const last = usable[usable.length - 1];
    if (last && sample.odometerMiles <= last.odometerMiles) continue;
    usable.push(sample);
  }

  const rates: number[] = [];
  for (let i = 0; i < usable.length; i += 1) {
    const start = usable[i];
    if (!start?.filledToBrim) continue;
    let litresOrKwh = 0;
    let end: FillUpSample | undefined;
    for (let j = i + 1; j < usable.length; j += 1) {
      const next = usable[j];
      if (!next) continue;
      litresOrKwh += next.quantity;
      if (next.filledToBrim) {
        end = next;
        break;
      }
    }
    if (!end || litresOrKwh <= 0) continue;
    const miles = end.odometerMiles - start.odometerMiles;
    if (miles < MIN_INTERVAL_MILES) continue;
    const km = milesToKm(miles);
    if (km <= 0) continue;
    rates.push((litresOrKwh / km) * 100);
  }

  if (rates.length === 0) return undefined;
  const result: CalibrationFromFillUps = {
    value: mean(rates),
    unit,
    sampleCount: rates.length,
  };
  const stddev = sampleStddev(rates);
  if (stddev !== undefined) result.stddev = stddev;
  return result;
}
