import {
  DIESEL_KG_CO2E_PER_LITRE,
  IMPERIAL_GALLON_LITRES,
  MILE_KM,
  PETROL_KG_CO2E_PER_LITRE,
  l100kmToMpg,
} from "../../shared/index.js";

/**
 * Steady-speed fuel per mile is rolling resistance plus aerodynamic drag.
 * drag = ROLL + AERO * mph^2. Slower steady speeds use less fuel.
 * Stops, hills, and cold starts are not in this curve.
 * Tuned so 70 mph uses about 13% more fuel than 60 mph.
 */
const SPEED_ROLL = 0.55;
const SPEED_AERO = 0.00009;

export const SPEED_MPH_MIN = 20;
export const SPEED_MPH_MAX = 80;
export const MPG_MAX = 300;
export const PRICE_PPL_MAX = 1000;
export const MILES_MAX = 2000;

export type PlayField = "miles" | "mpg" | "price" | "speed" | "save";

export type PlayIssue = { field: PlayField; message: string };

export type SavePlan =
  | {
      ok: true;
      savedLitres: number;
      savedPence: number;
      mpgNeeded: number;
      speedMph: number;
    }
  | { ok: false; message: string };

export type PlayFuelSuccess = {
  ok: true;
  pending: false;
  miles: number;
  effectiveMpg: number;
  litres: number;
  fuelPence: number;
  chargesPence: number;
  totalPence: number;
  co2Kg: number;
  hours: number;
  referenceMph: number;
  speedMph: number;
  versusReference: { litresDelta: number; penceDelta: number };
  save: SavePlan | null;
};

export type PlayFuelOutcome =
  | PlayFuelSuccess
  | { ok: false; pending: true }
  | { ok: false; pending: false; issues: PlayIssue[] };

export type FuelPlaySeed = {
  mpg: string;
  price: string;
  speed: string;
  referenceMph: number;
  miles: number;
};

function dragIndex(mph: number): number {
  return SPEED_ROLL + SPEED_AERO * mph * mph;
}

function litresFor(miles: number, mpg: number): number {
  return (miles / mpg) * IMPERIAL_GALLON_LITRES;
}

function trimNumber(value: number, digits: number): string {
  return String(Number(value.toFixed(digits)));
}

type Read = { state: "value"; value: number } | { state: "incomplete" } | { state: "invalid" };

function readDecimal(raw: string): Read {
  const text = raw.trim().replace(/,/g, ".");
  if (text === "." || text === "-" || text === "-." || /^-?\d+\.$/.test(text)) {
    return { state: "incomplete" };
  }
  if (text === "" || !/^-?\d+(\.\d+)?$/.test(text)) return { state: "invalid" };
  const value = Number(text);
  if (!Number.isFinite(value)) return { state: "invalid" };
  return { state: "value", value };
}

export function seedFuelPlay(input: {
  distanceMeters: number;
  durationSeconds: number;
  consumptionDisplay?: string | undefined;
  consumptionValue?: number | undefined;
  consumptionUnit?: string | undefined;
  pricePence?: number | undefined;
  priceUnit?: string | undefined;
  fallbackMpg?: number | undefined;
  fallbackPricePence?: number | undefined;
}): FuelPlaySeed {
  const fallbackMpg = input.fallbackMpg !== undefined && input.fallbackMpg > 0 ? input.fallbackMpg : 40;
  const fallbackPrice =
    input.fallbackPricePence !== undefined && input.fallbackPricePence > 0 ? input.fallbackPricePence : 140;

  let mpg = fallbackMpg;
  if (input.consumptionUnit === "l/100km" && input.consumptionValue !== undefined && input.consumptionValue > 0) {
    mpg = l100kmToMpg(input.consumptionValue);
  } else {
    const display = input.consumptionDisplay?.trim() ?? "";
    const match = /^(\d+(?:\.\d+)?)\s*mpg$/i.exec(display);
    if (match?.[1]) mpg = Number(match[1]);
  }
  if (!Number.isFinite(mpg) || mpg <= 0) mpg = fallbackMpg;
  if (mpg > MPG_MAX) mpg = MPG_MAX;

  const miles = input.distanceMeters > 0 ? metresToMiles(input.distanceMeters) : 0;
  const hours = input.durationSeconds > 0 ? input.durationSeconds / 3600 : 0;
  let mph = hours > 0 && miles > 0 ? miles / hours : 60;
  if (!Number.isFinite(mph) || mph <= 0) mph = 60;
  mph = Math.min(SPEED_MPH_MAX, Math.max(SPEED_MPH_MIN, Math.round(mph)));

  const price =
    input.priceUnit === "ppl" && input.pricePence !== undefined && input.pricePence > 0
      ? Math.min(input.pricePence, PRICE_PPL_MAX)
      : fallbackPrice;

  return {
    mpg: trimNumber(mpg, 1),
    price: trimNumber(price, 1),
    speed: String(mph),
    referenceMph: mph,
    miles,
  };
}

function planSave(input: {
  miles: number;
  litres: number;
  baseMpg: number;
  referenceMph: number;
  speedMph: number;
  effectiveMpg: number;
  pricePencePerLitre: number;
  saveLitres: number;
}): SavePlan {
  if (input.saveLitres < 0) {
    return { ok: false, message: "You cannot save a negative amount of fuel." };
  }
  if (input.saveLitres === 0) {
    return {
      ok: true,
      savedLitres: 0,
      savedPence: 0,
      mpgNeeded: input.effectiveMpg,
      speedMph: input.speedMph,
    };
  }
  if (input.saveLitres >= input.litres) {
    return { ok: false, message: "That is more fuel than this drive uses." };
  }
  const targetLitres = input.litres - input.saveLitres;
  const mpgNeeded = (input.miles * IMPERIAL_GALLON_LITRES) / targetLitres;
  const dragNeeded = (input.baseMpg * dragIndex(input.referenceMph)) / mpgNeeded;
  if (dragNeeded <= SPEED_ROLL) {
    return {
      ok: false,
      message: "Even at a crawl this still uses more fuel. Save less, or raise the mpg.",
    };
  }
  const speedMph = Math.sqrt((dragNeeded - SPEED_ROLL) / SPEED_AERO);
  if (speedMph < SPEED_MPH_MIN) {
    return {
      ok: false,
      message: `Saving that much needs about ${speedMph.toFixed(0)} mph, slower than the 20 mph this model allows.`,
    };
  }
  if (speedMph > SPEED_MPH_MAX) {
    return {
      ok: false,
      message: `That saving would need about ${speedMph.toFixed(0)} mph, above 80. Raise the mpg instead.`,
    };
  }
  return {
    ok: true,
    savedLitres: input.saveLitres,
    savedPence: input.saveLitres * input.pricePencePerLitre,
    mpgNeeded,
    speedMph,
  };
}

export function playFuelFromText(input: {
  routeMeters: number | null;
  milesText: string | null;
  mpgText: string;
  priceText: string;
  speedText: string;
  referenceMph: number;
  chargesPence: number;
  propulsion: "petrol" | "diesel";
  saveText: string;
}): PlayFuelOutcome {
  const issues: PlayIssue[] = [];
  let incomplete = false;

  let miles = 0;
  if (input.milesText === null) {
    if (input.routeMeters === null || input.routeMeters <= 0) {
      issues.push({
        field: "miles",
        message: "The route has no distance yet. Type the miles instead.",
      });
    } else {
      miles = metresToMiles(input.routeMeters);
    }
  } else if (input.milesText.trim() === "") {
    issues.push({ field: "miles", message: "Enter the miles for this drive." });
  } else {
    const read = readDecimal(input.milesText);
    if (read.state === "incomplete") incomplete = true;
    else if (read.state === "invalid") {
      issues.push({ field: "miles", message: "Enter the miles for this drive." });
    } else if (read.value <= 0) {
      issues.push({ field: "miles", message: "Miles must be above 0." });
    } else if (read.value > MILES_MAX) {
      issues.push({ field: "miles", message: "Keep a single drive under 2000 miles." });
    } else {
      miles = read.value;
    }
  }

  let mpg = 0;
  const mpgRead = input.mpgText.trim() === "" ? ({ state: "invalid" } as const) : readDecimal(input.mpgText);
  if (mpgRead.state === "incomplete") incomplete = true;
  else if (mpgRead.state === "invalid") {
    issues.push({
      field: "mpg",
      message:
        input.mpgText.trim() === ""
          ? "Enter an mpg above 0."
          : "Enter mpg as a number, using a dot for decimals.",
    });
  } else if (mpgRead.value <= 0) {
    issues.push({ field: "mpg", message: "Enter an mpg above 0." });
  } else if (mpgRead.value > MPG_MAX) {
    issues.push({ field: "mpg", message: "That mpg is above 300. Check the figure." });
  } else {
    mpg = mpgRead.value;
  }

  let price = 0;
  const priceRead = input.priceText.trim() === "" ? ({ state: "invalid" } as const) : readDecimal(input.priceText);
  if (priceRead.state === "incomplete") incomplete = true;
  else if (priceRead.state === "invalid") {
    issues.push({
      field: "price",
      message:
        input.priceText.trim() === ""
          ? "Enter a pump price above 0."
          : "Enter the pump price as a number, using a dot for decimals.",
    });
  } else if (priceRead.value <= 0) {
    issues.push({ field: "price", message: "Enter a pump price above 0." });
  } else if (priceRead.value > PRICE_PPL_MAX) {
    issues.push({ field: "price", message: "That price is above 1000 p per litre. Check it." });
  } else {
    price = priceRead.value;
  }

  let speed = 0;
  const speedRead = input.speedText.trim() === "" ? ({ state: "invalid" } as const) : readDecimal(input.speedText);
  if (speedRead.state === "incomplete") incomplete = true;
  else if (speedRead.state === "invalid") {
    issues.push({
      field: "speed",
      message: input.speedText.trim() === "" ? "Enter a speed in mph." : "Enter speed in mph as a number.",
    });
  } else if (speedRead.value < SPEED_MPH_MIN || speedRead.value > SPEED_MPH_MAX) {
    issues.push({ field: "speed", message: "Keep steady speed between 20 and 80 mph." });
  } else {
    speed = speedRead.value;
  }

  const reference = input.referenceMph;
  if (!Number.isFinite(reference) || reference <= 0) {
    issues.push({ field: "speed", message: "Set a speed first." });
  }

  let saveLitres: number | null = null;
  const saveRaw = input.saveText.trim();
  if (saveRaw !== "") {
    const saveRead = readDecimal(saveRaw);
    if (saveRead.state === "incomplete") {
      saveLitres = null;
    } else if (saveRead.state === "invalid") {
      issues.push({
        field: "save",
        message: "Enter litres to save as a number, or leave it blank.",
      });
    } else {
      saveLitres = saveRead.value;
    }
  }

  if (issues.length > 0) return { ok: false, pending: false, issues };
  if (incomplete) return { ok: false, pending: true };

  const effectiveMpg = mpg * (dragIndex(reference) / dragIndex(speed));
  const litres = litresFor(miles, effectiveMpg);
  const referenceLitres = litresFor(miles, mpg);
  const fuelPence = litres * price;
  const chargesPence = Number.isFinite(input.chargesPence) && input.chargesPence > 0 ? input.chargesPence : 0;
  const factor = input.propulsion === "diesel" ? DIESEL_KG_CO2E_PER_LITRE : PETROL_KG_CO2E_PER_LITRE;

  return {
    ok: true,
    pending: false,
    miles,
    effectiveMpg,
    litres,
    fuelPence,
    chargesPence,
    totalPence: fuelPence + chargesPence,
    co2Kg: litres * factor,
    hours: miles / speed,
    referenceMph: reference,
    speedMph: speed,
    versusReference: {
      litresDelta: litres - referenceLitres,
      penceDelta: (litres - referenceLitres) * price,
    },
    save:
      saveLitres === null
        ? null
        : planSave({
            miles,
            litres,
            baseMpg: mpg,
            referenceMph: reference,
            speedMph: speed,
            effectiveMpg,
            pricePencePerLitre: price,
            saveLitres,
          }),
  };
}

function metresToMiles(metres: number): number {
  return metres / 1000 / MILE_KM;
}
