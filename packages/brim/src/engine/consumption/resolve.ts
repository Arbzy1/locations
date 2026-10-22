import type { ConsumptionTier, ConsumptionUnit } from '../../shared/index.js';
import {
  CLASS_AVERAGE_KWH_PER_100KM,
  CLASS_AVERAGE_L_PER_100KM,
  NEDC_CORRECTION,
  WLTP_CORRECTION,
  WLTP_EV_CORRECTION,
  milesPerKwhToKwhPer100km,
  mpgToL100km,
} from '../../shared/index.js';

export type ResolvedConsumption = {
  value: number;
  unit: "l/100km" | "kWh/100km";
  tier: ConsumptionTier;
  label: string;
  reasons: string[];
};

const TIER_LABEL: Record<ConsumptionTier, string> = {
  0: "Based on your fill-ups",
  1: "You told us",
  2: "Official figure, adjusted",
  3: "Estimated from similar vehicles",
  4: "Rough estimate",
};

export type ResolveConsumptionInput = {
  kind: "liquid" | "electric";
  propulsion?: "petrol" | "diesel" | "hybrid" | "phev" | "bev" | undefined;
  calibration?: { value: number; unit: ConsumptionUnit; sampleCount: number } | undefined;
  userEntered?: { value: number; unit: ConsumptionUnit } | undefined;
  official?: { value: number; unit: ConsumptionUnit; cycle: "WLTP" | "NEDC" } | undefined;
  classAverage?: { value: number; unit: ConsumptionUnit } | undefined;
  providerEstimate?: { litres: number; distanceKm: number } | undefined;
};

function toCanonical(
  value: number,
  unit: ConsumptionUnit,
  kind: "liquid" | "electric",
): { value: number; unit: "l/100km" | "kWh/100km" } {
  if (kind === "liquid") {
    if (unit === "mpg") return { value: mpgToL100km(value), unit: "l/100km" };
    return { value, unit: "l/100km" };
  }
  if (unit === "mi/kWh") return { value: milesPerKwhToKwhPer100km(value), unit: "kWh/100km" };
  return { value, unit: "kWh/100km" };
}

function correctionFor(cycle: "WLTP" | "NEDC", kind: "liquid" | "electric"): number {
  if (kind === "electric") return WLTP_EV_CORRECTION;
  return cycle === "NEDC" ? NEDC_CORRECTION : WLTP_CORRECTION;
}

function classFallback(kind: "liquid" | "electric", propulsion: ResolveConsumptionInput["propulsion"]): number {
  if (kind === "electric") {
    return propulsion === "phev" ? CLASS_AVERAGE_KWH_PER_100KM.phev : CLASS_AVERAGE_KWH_PER_100KM.bev;
  }
  if (propulsion === "diesel") return CLASS_AVERAGE_L_PER_100KM.diesel;
  if (propulsion === "hybrid" || propulsion === "phev") return CLASS_AVERAGE_L_PER_100KM.hybrid;
  return CLASS_AVERAGE_L_PER_100KM.petrol;
}

export function resolveConsumption(inputs: ResolveConsumptionInput): ResolvedConsumption {
  const reasons: string[] = [];
  const unit = inputs.kind === "liquid" ? "l/100km" : "kWh/100km";

  if (inputs.calibration && inputs.calibration.sampleCount >= 3) {
    const c = toCanonical(inputs.calibration.value, inputs.calibration.unit, inputs.kind);
    reasons.push(
      `Used your last ${inputs.calibration.sampleCount} brim-to-brim intervals rather than the brochure figure.`,
    );
    return { ...c, tier: 0, label: TIER_LABEL[0], reasons };
  }
  if (inputs.calibration && inputs.calibration.sampleCount < 3) {
    reasons.push("Not enough fill-ups yet for a personal figure - need at least 3 brim-to-brim intervals.");
  }

  if (inputs.userEntered) {
    const c = toCanonical(inputs.userEntered.value, inputs.userEntered.unit, inputs.kind);
    reasons.push("Used the consumption figure you entered.");
    return { ...c, tier: 1, label: TIER_LABEL[1], reasons };
  }

  if (inputs.official) {
    const c = toCanonical(inputs.official.value, inputs.official.unit, inputs.kind);
    const factor = correctionFor(inputs.official.cycle, inputs.kind);
    const pct = Math.round((factor - 1) * 100);
    reasons.push(
      `Adjusted the official figure up ${pct}% - official tests run optimistic.`,
    );
    return {
      value: c.value * factor,
      unit: c.unit,
      tier: 2,
      label: TIER_LABEL[2],
      reasons,
    };
  }

  if (inputs.classAverage) {
    const c = toCanonical(inputs.classAverage.value, inputs.classAverage.unit, inputs.kind);
    reasons.push("No figure for this car, so we used similar vehicles.");
    return { ...c, tier: 3, label: TIER_LABEL[3], reasons };
  }

  if (inputs.providerEstimate && inputs.providerEstimate.distanceKm > 0) {
    const litresPer100 = (inputs.providerEstimate.litres / inputs.providerEstimate.distanceKm) * 100;
    reasons.push("Used the routing provider's rough fuel guess.");
    return {
      value: inputs.kind === "liquid" ? litresPer100 : litresPer100 * 9.7,
      unit,
      tier: 4,
      label: TIER_LABEL[4],
      reasons,
    };
  }

  const fallback = classFallback(inputs.kind, inputs.propulsion);
  reasons.push("Estimated from similar vehicles - we only know the fuel type.");
  return { value: fallback, unit, tier: 3, label: TIER_LABEL[3], reasons };
}
