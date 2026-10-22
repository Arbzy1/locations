/** Imperial gallon in litres. BS 350 / Weights and Measures. */
export const IMPERIAL_GALLON_LITRES = 4.54609;

/** International mile in kilometres. */
export const MILE_KM = 1.609344;

/**
 * mpg (imperial) ↔ L/100km.
 * L/100km = 100 / (mpg × gallon_km) = 100 × MILE_KM / (mpg × IMPERIAL_GALLON_LITRES)
 * Spec §5.1 quotes 282.481.
 */
export const MPG_L100KM = 100 * (IMPERIAL_GALLON_LITRES / MILE_KM);

/**
 * mi/kWh ↔ kWh/100km.
 * 100 km = 100 / MILE_KM miles ≈ 62.137119 miles. Spec §5.5 quotes 62.137.
 */
export const MILES_PER_KWH_TO_KWH_PER_100KM = 100 / MILE_KM;

export function mpgToL100km(mpg: number): number {
  return MPG_L100KM / mpg;
}

export function l100kmToMpg(l100km: number): number {
  return MPG_L100KM / l100km;
}

export function milesPerKwhToKwhPer100km(miPerKwh: number): number {
  return MILES_PER_KWH_TO_KWH_PER_100KM / miPerKwh;
}

export function kwhPer100kmToMilesPerKwh(kwhPer100km: number): number {
  return MILES_PER_KWH_TO_KWH_PER_100KM / kwhPer100km;
}

export function kmToMiles(km: number): number {
  return km / MILE_KM;
}

export function milesToKm(miles: number): number {
  return miles * MILE_KM;
}

export function litresToImperialGallons(litres: number): number {
  return litres / IMPERIAL_GALLON_LITRES;
}

export function imperialGallonsToLitres(gallons: number): number {
  return gallons * IMPERIAL_GALLON_LITRES;
}

export function penceToPounds(pence: number): number {
  return pence / 100;
}

export function poundsToPence(pounds: number): number {
  return pounds * 100;
}

export function metresToKm(metres: number): number {
  return metres / 1000;
}
