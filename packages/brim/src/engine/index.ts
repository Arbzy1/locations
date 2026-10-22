import type {
  Charge,
  Estimate,
  PriceSource,
  Propulsion,
  RoadComposition,
  VehicleProfile,
  Warning,
} from '../shared/index.js';
import { l100kmToMpg, metresToKm } from '../shared/index.js';
import { bandWidth, extraFallbacksFromCalibration } from "./confidence.js";
import { applyRoadShape } from "./consumption/roadShape.js";
import { resolveConsumption } from "./consumption/resolve.js";
import { arrivalStateOfCharge } from "./estimate/arrival.js";
import { estimateEv } from "./estimate/ev.js";
import { estimateIce } from "./estimate/ice.js";
import { roundBandPence } from "./rounding.js";

export type EstimateInput = {
  distanceMeters: number;
  durationSeconds?: number | undefined;
  propulsion: Propulsion;
  vehicle?: VehicleProfile | undefined;
  calibration?: {
    value: number;
    unit: "l/100km" | "kWh/100km" | "mpg" | "mi/kWh";
    sampleCount: number;
    stddev?: number | undefined;
  } | undefined;
  userEntered?: { value: number; unit: "l/100km" | "kWh/100km" | "mpg" | "mi/kWh" } | undefined;
  official?: { value: number; unit: "l/100km" | "kWh/100km" | "mpg" | "mi/kWh"; cycle: "WLTP" | "NEDC" } | undefined;
  classAverage?: { value: number; unit: "l/100km" | "kWh/100km" | "mpg" | "mi/kWh" } | undefined;
  providerEstimate?: { litres: number } | undefined;
  roadComposition?: RoadComposition | undefined;
  pricePence: number;
  priceUnit: "ppl" | "p/kWh";
  priceSource: PriceSource;
  priceObservedAt: string;
  stationId?: string | undefined;
  charging?: "acHome" | "dcRapid" | undefined;
  forecastTempC?: number | undefined;
  gridIntensityGPerKwh?: number | undefined;
  liquidPricePence?: number | undefined;
  nowIso?: string | undefined;
  charges?: Charge[] | undefined;
};

export function computeEstimate(input: EstimateInput): Estimate {
  const reasons: string[] = [];
  const warnings: Warning[] = [];
  const charges = input.charges ?? [];
  const chargesPence = charges.reduce((sum, c) => sum + c.pence, 0);

  const kind = input.propulsion === "bev" || input.propulsion === "phev" ? "electric" : "liquid";

  if (input.propulsion === "phev" && input.vehicle?.startChargePercent === undefined) {
    reasons.push(
      "No starting charge for the plug-in hybrid, so we used a combined figure and kept confidence low.",
    );
    warnings.push({
      code: "phev-no-start-charge",
      message: "PHEV cost depends almost entirely on charging. Add a starting charge for a better estimate.",
      severity: "warning",
    });
  }

  const resolved = resolveConsumption({
    kind: input.propulsion === "bev" ? "electric" : kind === "electric" && input.propulsion !== "phev" ? "electric" : "liquid",
    propulsion: input.propulsion,
    calibration: input.calibration,
    userEntered: input.userEntered,
    official: input.official,
    classAverage: input.classAverage,
    providerEstimate: input.providerEstimate
      ? { litres: input.providerEstimate.litres, distanceKm: metresToKm(input.distanceMeters) }
      : undefined,
  });
  reasons.push(...resolved.reasons);

  const shaped = applyRoadShape(
    resolved,
    input.propulsion === "bev" ? "electric" : "liquid",
    input.roadComposition,
  );
  reasons.push(...shaped.reasons);
  const varianceFallbacks = extraFallbacksFromCalibration(input.calibration);
  if (varianceFallbacks > 0) reasons.push("Your fill-ups vary, so the range is wider.");
  const halfWidth = bandWidth(resolved.tier, shaped.fallbacks + varianceFallbacks);

  const durationSeconds = input.durationSeconds ?? 0;
  const priceObservedAt = input.priceObservedAt;

  if (input.propulsion === "bev") {
    const ev = estimateEv({
      distanceMeters: input.distanceMeters,
      kwhPer100km: shaped.value,
      pricePencePerKwh: input.pricePence,
      charging: input.charging ?? "acHome",
      halfWidth,
      tempC: input.forecastTempC,
      hasHeatPump: input.vehicle?.hasHeatPump === true,
      gridIntensityGPerKwh: input.gridIntensityGPerKwh ?? 150,
    });
    reasons.push(...ev.reasons);
    const energyPence = roundBandPence(ev.costPence);
    const totalPence = roundBandPence({
      point: energyPence.point + chargesPence,
      low: energyPence.low + chargesPence,
      high: energyPence.high + chargesPence,
    });
    const usable = input.vehicle?.batteryKwhUsable;
    const start = input.vehicle?.startChargePercent;
    const arrival =
      usable !== undefined && start !== undefined
        ? arrivalStateOfCharge({
            startPct: start,
            batteryKwhUsed: ev.batteryKwh.point,
            usableBatteryKwh: usable,
          })
        : undefined;
    if (usable === undefined) {
      warnings.push({
        code: "missing-battery",
        message: "Add usable battery size to see whether you will arrive with charge to spare.",
        severity: "info",
      });
    }
    return {
      distanceMeters: input.distanceMeters,
      durationSeconds,
      energy: {
        kind: "electric",
        kwh: {
          battery: ev.batteryKwh.point,
          grid: ev.gridKwh.point,
          low: ev.gridKwh.low,
          high: ev.gridKwh.high,
        },
        arrivalStateOfCharge: arrival,
      },
      cost: { energyPence, chargesPence, totalPence },
      charges,
      co2Kg: ev.co2Kg,
      consumption: {
        value: shaped.value,
        unit: "kWh/100km",
        display: `${shaped.value.toFixed(1)} kWh/100km`,
        tier: resolved.tier,
        label: resolved.label,
      },
      price: {
        pence: input.pricePence,
        unit: "p/kWh",
        source: input.priceSource,
        stationId: input.stationId,
        observedAt: priceObservedAt,
      },
      reasons,
      warnings,
    };
  }

  if (input.propulsion === "phev") {
    const usable = input.vehicle?.batteryKwhUsable;
    const start = input.vehicle?.startChargePercent;
    const km = metresToKm(input.distanceMeters);
    if (usable !== undefined && start !== undefined && start > 0) {
      const evResolved = resolveConsumption({
        kind: "electric",
        propulsion: "phev",
        userEntered: input.userEntered,
        official: input.official,
        classAverage: input.classAverage,
      });
      const evKwhPer100 = applyRoadShape(evResolved, "electric", input.roadComposition).value;
      const evRangeKm = (usable * (start / 100) / evKwhPer100) * 100;
      const electricKm = Math.min(km, evRangeKm);
      const iceKm = Math.max(0, km - electricKm);
      const evPart = estimateEv({
        distanceMeters: electricKm * 1000,
        kwhPer100km: evKwhPer100,
        pricePencePerKwh: input.pricePence,
        charging: input.charging ?? "acHome",
        halfWidth,
        tempC: input.forecastTempC,
        hasHeatPump: input.vehicle?.hasHeatPump === true,
        gridIntensityGPerKwh: input.gridIntensityGPerKwh ?? 150,
      });
      reasons.push(...evPart.reasons);
      const iceResolved = resolveConsumption({
        kind: "liquid",
        propulsion: "petrol",
        calibration: input.calibration,
        official: input.official,
        classAverage: input.classAverage,
      });
      const ice = estimateIce({
        distanceMeters: iceKm * 1000,
        lPer100km: iceResolved.value,
        pricePencePerLitre:
          input.priceUnit === "ppl" ? input.pricePence : (input.liquidPricePence ?? 140),
        propulsion: "petrol",
        halfWidth,
      });
      reasons.push("Treated the plug-in hybrid as electric until the battery is empty, then petrol.");
      const energyPence = roundBandPence({
        point: evPart.costPence.point + ice.costPence.point,
        low: evPart.costPence.low + ice.costPence.low,
        high: evPart.costPence.high + ice.costPence.high,
      });
      const totalPence = roundBandPence({
        point: energyPence.point + chargesPence,
        low: energyPence.low + chargesPence,
        high: energyPence.high + chargesPence,
      });
      return {
        distanceMeters: input.distanceMeters,
        durationSeconds,
        energy: {
          kind: "liquid",
          litres: ice.litres,
          kwh: {
            battery: evPart.batteryKwh.point,
            grid: evPart.gridKwh.point,
            low: evPart.gridKwh.low,
            high: evPart.gridKwh.high,
          },
        },
        cost: { energyPence, chargesPence, totalPence },
        charges,
        co2Kg: evPart.co2Kg + ice.co2Kg,
        consumption: {
          value: resolved.value,
          unit: resolved.unit,
          display:
            resolved.unit === "l/100km"
              ? `${l100kmToMpg(resolved.value).toFixed(0)} mpg`
              : `${resolved.value.toFixed(1)} kWh/100km`,
          tier: resolved.tier,
          label: resolved.label,
        },
        price: {
          pence: input.pricePence,
          unit: input.priceUnit,
          source: input.priceSource,
          stationId: input.stationId,
          observedAt: priceObservedAt,
        },
        reasons,
        warnings,
      };
    }
  }

  const ice = estimateIce({
    distanceMeters: input.distanceMeters,
    lPer100km: shaped.value,
    pricePencePerLitre: input.priceUnit === "ppl" ? input.pricePence : 140,
    propulsion: input.propulsion === "diesel" ? "diesel" : "petrol",
    halfWidth,
  });
  const energyPence = roundBandPence(ice.costPence);
  const totalPence = roundBandPence({
    point: energyPence.point + chargesPence,
    low: energyPence.low + chargesPence,
    high: energyPence.high + chargesPence,
  });

  return {
    distanceMeters: input.distanceMeters,
    durationSeconds,
    energy: { kind: "liquid", litres: ice.litres },
    cost: { energyPence, chargesPence, totalPence },
    charges,
    co2Kg: ice.co2Kg,
    consumption: {
      value: shaped.value,
      unit: "l/100km",
      display: `${l100kmToMpg(shaped.value).toFixed(0)} mpg`,
      tier: resolved.tier,
      label: resolved.label,
    },
    price: {
      pence: input.pricePence,
      unit: "ppl",
      source: input.priceSource,
      stationId: input.stationId,
      observedAt: priceObservedAt,
    },
    reasons,
    warnings,
  };
}

export {
  CHEAPEST_FILL_CAP,
  DEFAULT_MAX_PERPENDICULAR_METERS,
  DEFAULT_REMAINING_FRACTION,
  DEFAULT_TANK_LITRES,
  FILL_HASSLE_PENCE,
  MIN_FILL_SAVING_PENCE,
  litresToFill,
  pencePerKmFromConsumption,
  rankCheapestFill,
  type FillCandidate,
  type RankCheapestFillInput,
  type RankCheapestFillResult,
  type RankedFill,
} from "./fill/index.js";
export {
  calibrateFromFillUps,
  MIN_INTERVAL_MILES,
  type CalibrationFromFillUps,
  type FillUpSample,
} from "./consumption/calibrate.js";
export {
  complianceForZone,
  daysWindowApplies,
  deriveEuroFromYear,
  localDaysTouched,
  londonParts,
  parseEuroStatus,
  resolveCharges,
  resolveEuro,
  windowApplies,
  type ChargeHitInput,
  type ComplianceResult,
  type ComplianceVerdict,
  type ResolveChargesInput,
  type ResolveChargesResult,
} from "./charges/index.js";

