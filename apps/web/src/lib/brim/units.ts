import type { DistanceUnit } from "../../utils/format";

const METERS_PER_MILE = 1609.344;
const MPG_L100KM_PRODUCT = 282.4809363;
const MIKWH_KWH100KM_PRODUCT = 62.1371192;

export function formatBrimDistance(meters: number, unit: DistanceUnit, decimals = 1): string {
  if (!Number.isFinite(meters) || meters < 0) return unit === "km" ? "0 km" : "0 mi";
  if (unit === "km") {
    return `${(meters / 1000).toFixed(decimals)} km`;
  }
  return `${(meters / METERS_PER_MILE).toFixed(decimals)} mi`;
}

export function formatBrimMiles(miles: number, unit: DistanceUnit, decimals = 0): string {
  if (!Number.isFinite(miles) || miles < 0) return unit === "km" ? "0 km" : "0 mi";
  if (unit === "km") {
    return `${(miles * 1.609344).toFixed(decimals)} km`;
  }
  return `${miles.toFixed(decimals)} mi`;
}

export function formatBrimDetourKm(detourKm: number, unit: DistanceUnit): string {
  if (!Number.isFinite(detourKm) || detourKm < 0) return unit === "km" ? "0.0 km" : "0.0 mi";
  if (unit === "km") return `${detourKm.toFixed(1)} km`;
  return `${(detourKm / 1.609344).toFixed(1)} mi`;
}

export function formatBrimDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0 min";
  const totalMin = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours === 0) return `${mins} min`;
  if (mins === 0) return `${hours} h`;
  return `${hours} h ${mins} min`;
}

export function formatBrimConsumption(
  value: number | undefined,
  rawUnit: string | undefined,
  unitPref: DistanceUnit,
  fallbackDisplay?: string,
): string {
  if (value === undefined || !Number.isFinite(value) || value <= 0 || !rawUnit) {
    return fallbackDisplay ?? "";
  }
  if (rawUnit === "l/100km") {
    if (unitPref === "km") return `${value.toFixed(1)} L/100km`;
    return `${(MPG_L100KM_PRODUCT / value).toFixed(1)} mpg`;
  }
  if (rawUnit === "mpg") {
    if (unitPref === "mi") return `${value.toFixed(1)} mpg`;
    return `${(MPG_L100KM_PRODUCT / value).toFixed(1)} L/100km`;
  }
  if (rawUnit === "kWh/100km") {
    if (unitPref === "km") return `${value.toFixed(1)} kWh/100km`;
    return `${(MIKWH_KWH100KM_PRODUCT / value).toFixed(1)} mi/kWh`;
  }
  if (rawUnit === "mi/kWh") {
    if (unitPref === "mi") return `${value.toFixed(1)} mi/kWh`;
    return `${(MIKWH_KWH100KM_PRODUCT / value).toFixed(1)} kWh/100km`;
  }
  return fallbackDisplay ?? `${value.toFixed(1)} ${rawUnit}`;
}

export function mpgToL100km(mpg: number): number {
  return mpg > 0 ? MPG_L100KM_PRODUCT / mpg : 0;
}

export function mphToKmh(mph: number): number {
  return mph * 1.609344;
}
