import type { Propulsion, VehicleKind } from '../../shared/index.js';

export type EuroResolution = {
  euro?: number;
  source: "dvla" | "derived";
  derived: boolean;
};

const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6 };

/**
 * First-registration approximation used only when euroStatus is missing.
 * Petrol/hybrid/PHEV: 2006 Euro 4, 2011 Euro 5, 2015 Euro 6.
 * Diesel: 2006 Euro 4, 2011 Euro 5, 2016 Euro 6 (2015 diesels treated as Euro 5).
 * Motorcycles: 2007 Euro 3, 2017 Euro 4.
 */
export function deriveEuroFromYear(
  propulsion: Propulsion,
  kind: VehicleKind,
  year: number,
): number {
  if (kind === "motorcycle") {
    if (year >= 2017) return 4;
    if (year >= 2007) return 3;
    return 2;
  }
  if (propulsion === "diesel") {
    if (year >= 2016) return 6;
    if (year >= 2011) return 5;
    if (year >= 2006) return 4;
    return 3;
  }
  if (year >= 2015) return 6;
  if (year >= 2011) return 5;
  if (year >= 2006) return 4;
  return 3;
}

export function parseEuroStatus(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const s = raw.trim().toLowerCase().replace(/[_-]+/g, " ");
  const roman = s.replace(/euro\s*/g, "").trim();
  if (ROMAN[roman] !== undefined) return ROMAN[roman];
  const n = s.match(/(\d+)/);
  if (!n?.[1]) return undefined;
  const euro = Number(n[1]);
  return euro >= 1 && euro <= 7 ? euro : undefined;
}

export function resolveEuro(input: {
  euroStatus?: string | undefined;
  euroStatusSource?: "dvla" | "derived" | undefined;
  propulsion: Propulsion;
  kind: VehicleKind;
  year?: number | undefined;
}): EuroResolution {
  const parsed = parseEuroStatus(input.euroStatus);
  if (parsed !== undefined) {
    const source = input.euroStatusSource === "dvla" ? "dvla" : "derived";
    return { euro: parsed, source, derived: source !== "dvla" };
  }
  if (input.year !== undefined) {
    return {
      euro: deriveEuroFromYear(input.propulsion, input.kind, input.year),
      source: "derived",
      derived: true,
    };
  }
  return { source: "derived", derived: true };
}
