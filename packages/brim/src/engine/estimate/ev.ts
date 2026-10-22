import { CHARGING_EFFICIENCY, EV_TEMPERATURE_FACTORS, metresToKm } from '../../shared/index.js';
import { applyBand } from "../confidence.js";

export function temperatureFactor(
  tempC: number | undefined,
  hasHeatPump: boolean,
): { factor: number; reason: string | undefined } {
  if (tempC === undefined) {
    return {
      factor: 1,
      reason: "No forecast temperature, so we skipped the cold-weather adjustment.",
    };
  }
  let factor = 1.4;
  for (const row of EV_TEMPERATURE_FACTORS) {
    const minOk = row.minC === null || tempC >= row.minC;
    const maxOk = row.maxC === null || tempC < row.maxC || (row.minC !== null && tempC === row.minC);
    // Boundaries: ≥15, 5–15, 0–5, <0. Exact 15 uses 1.00; exact 5 uses 1.10; exact 0 uses 1.25.
    if (row.minC === 15 && tempC >= 15) {
      factor = row.factor;
      break;
    }
    if (row.minC === 5 && tempC >= 5 && tempC < 15) {
      factor = row.factor;
      break;
    }
    if (row.minC === 0 && tempC >= 0 && tempC < 5) {
      factor = row.factor;
      break;
    }
    if (row.minC === null && tempC < 0) {
      factor = row.factor;
      break;
    }
    void minOk;
    void maxOk;
  }
  const uplift = factor - 1;
  const applied = hasHeatPump ? 1 + uplift / 2 : factor;
  if (applied === 1) {
    return { factor: applied, reason: undefined };
  }
  const pct = Math.round((applied - 1) * 1000) / 10;
  const heat = hasHeatPump && uplift > 0 ? " Heat pump halved the extra use." : "";
  return {
    factor: applied,
    reason: `Forecast was ${tempC}°C, so we increased energy use by ${pct}%.${heat}`,
  };
}

export function estimateEv(input: {
  distanceMeters: number;
  kwhPer100km: number;
  pricePencePerKwh: number;
  charging: "acHome" | "dcRapid";
  halfWidth: number;
  tempC: number | undefined;
  hasHeatPump: boolean;
  gridIntensityGPerKwh: number;
}): {
  batteryKwh: { point: number; low: number; high: number };
  gridKwh: { point: number; low: number; high: number };
  costPence: { point: number; low: number; high: number };
  co2Kg: number;
  reasons: string[];
} {
  const reasons: string[] = [];
  const { factor, reason } = temperatureFactor(input.tempC, input.hasHeatPump);
  if (reason) reasons.push(reason);
  const km = metresToKm(input.distanceMeters);
  const batteryPoint = (km / 100) * input.kwhPer100km * factor;
  const battery = applyBand(batteryPoint, input.halfWidth);
  const efficiency = CHARGING_EFFICIENCY[input.charging];
  const grid = {
    point: battery.point / efficiency,
    low: battery.low / efficiency,
    high: battery.high / efficiency,
  };
  const costPence = {
    point: grid.point * input.pricePencePerKwh,
    low: grid.low * input.pricePencePerKwh,
    high: grid.high * input.pricePencePerKwh,
  };
  reasons.push("Cost is billed on energy drawn from the grid, not energy in the battery.");
  return {
    batteryKwh: battery,
    gridKwh: grid,
    costPence,
    co2Kg: (battery.point * input.gridIntensityGPerKwh) / 1000,
    reasons,
  };
}
