import {
  DIESEL_KG_CO2E_PER_LITRE,
  PETROL_KG_CO2E_PER_LITRE,
  metresToKm,
} from '../../shared/index.js';
import { applyBand } from "../confidence.js";

export function estimateIce(input: {
  distanceMeters: number;
  lPer100km: number;
  pricePencePerLitre: number;
  propulsion: "petrol" | "diesel" | "hybrid" | "phev";
  halfWidth: number;
}): {
  litres: { point: number; low: number; high: number };
  costPence: { point: number; low: number; high: number };
  co2Kg: number;
} {
  const km = metresToKm(input.distanceMeters);
  const litresPoint = (km / 100) * input.lPer100km;
  const litres = applyBand(litresPoint, input.halfWidth);
  const costPence = {
    point: litres.point * input.pricePencePerLitre,
    low: litres.low * input.pricePencePerLitre,
    high: litres.high * input.pricePencePerLitre,
  };
  const factor = input.propulsion === "diesel" ? DIESEL_KG_CO2E_PER_LITRE : PETROL_KG_CO2E_PER_LITRE;
  return { litres, costPence, co2Kg: litres.point * factor };
}
