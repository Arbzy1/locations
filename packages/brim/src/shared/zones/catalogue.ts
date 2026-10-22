import {
  HOURS_ALWAYS_EXCEPT_CHRISTMAS,
  HOURS_BRISTOL_CAZ,
  HOURS_DART,
  HOURS_LONDON_CC,
} from "./hours.js";
import type { ChargeScheme, ZoneGeometry } from "./types.js";

const VERIFIED_ON = "2026-08-16";

function box(west: number, south: number, east: number, north: number): ZoneGeometry {
  return {
    type: "MultiPolygon",
    coordinates: [
      [
        [
          [west, south],
          [east, south],
          [east, north],
          [west, north],
          [west, south],
        ],
      ],
    ],
  };
}

function zone(
  partial: Omit<ChargeScheme, "datasetVersion" | "verifiedOn" | "appliesHours"> & {
    appliesHours?: ChargeScheme["appliesHours"];
  },
): ChargeScheme {
  return {
    ...partial,
    appliesHours: partial.appliesHours ?? HOURS_ALWAYS_EXCEPT_CHRISTMAS,
    verifiedOn: VERIFIED_ON,
    datasetVersion: VERIFIED_ON,
  };
}

/** Simplified envelopes covering official scheme areas. Not cadastral boundaries. */
export const ZONE_CATALOGUE: ChargeScheme[] = [
  zone({
    id: "london-ulez",
    name: "London Ultra Low Emission Zone",
    authority: "Transport for London",
    schemeKind: "ulez",
    chargePence: 1250,
    isRestriction: false,
    sourceUrl: "https://tfl.gov.uk/modes/driving/ultra-low-emission-zone",
    operatorUrl: "https://tfl.gov.uk/modes/driving/ultra-low-emission-zone/check-your-vehicle",
    geometry: box(-0.55, 51.286, 0.2, 51.7),
  }),
  zone({
    id: "london-cc",
    name: "London Congestion Charge",
    authority: "Transport for London",
    schemeKind: "congestion",
    chargePence: 1500,
    isRestriction: false,
    appliesHours: HOURS_LONDON_CC,
    sourceUrl: "https://tfl.gov.uk/modes/driving/congestion-charge",
    operatorUrl: "https://tfl.gov.uk/modes/driving/congestion-charge",
    geometry: box(-0.2, 51.486, -0.07, 51.535),
  }),
  zone({
    id: "birmingham-caz",
    name: "Birmingham Clean Air Zone",
    authority: "Birmingham City Council",
    schemeKind: "caz",
    cazClass: "D",
    chargePence: 800,
    isRestriction: false,
    sourceUrl: "https://www.birmingham.gov.uk/caz",
    operatorUrl: "https://www.birmingham.gov.uk/caz",
    geometry: box(-1.915, 52.472, -1.87, 52.495),
  }),
  zone({
    id: "bath-caz",
    name: "Bath Clean Air Zone",
    authority: "Bath and North East Somerset Council",
    schemeKind: "caz",
    cazClass: "C",
    chargePence: 900,
    isRestriction: false,
    sourceUrl: "https://beta.bathnes.gov.uk/clean-air-zone",
    operatorUrl: "https://beta.bathnes.gov.uk/check-if-you-need-pay-clean-air-zone-charge",
    geometry: box(-2.375, 51.376, -2.348, 51.39),
  }),
  zone({
    id: "bristol-caz",
    name: "Bristol Clean Air Zone",
    authority: "Bristol City Council",
    schemeKind: "caz",
    cazClass: "D",
    chargePence: 900,
    isRestriction: false,
    appliesHours: HOURS_BRISTOL_CAZ,
    sourceUrl: "https://www.bristol.gov.uk/residents/streets-travel/bristol-clean-air-zone",
    operatorUrl: "https://www.bristol.gov.uk/residents/streets-travel/bristol-clean-air-zone",
    geometry: box(-2.605, 51.442, -2.56, 51.465),
  }),
  zone({
    id: "bradford-caz",
    name: "Bradford Clean Air Zone",
    authority: "City of Bradford Metropolitan District Council",
    schemeKind: "caz",
    cazClass: "C",
    chargePence: 900,
    isRestriction: false,
    sourceUrl: "https://www.bradford.gov.uk/breathe-better-bradford/clean-air-zone/",
    operatorUrl: "https://www.bradford.gov.uk/breathe-better-bradford/clean-air-zone/",
    geometry: box(-1.77, 53.785, -1.735, 53.805),
  }),
  zone({
    id: "sheffield-caz",
    name: "Sheffield Clean Air Zone",
    authority: "Sheffield City Council",
    schemeKind: "caz",
    cazClass: "C",
    chargePence: 900,
    isRestriction: false,
    sourceUrl: "https://www.sheffield.gov.uk/campaigns/clean-air-zone",
    operatorUrl: "https://www.sheffield.gov.uk/campaigns/clean-air-zone",
    geometry: box(-1.49, 53.37, -1.45, 53.39),
  }),
  zone({
    id: "glasgow-lez",
    name: "Glasgow Low Emission Zone",
    authority: "Glasgow City Council",
    schemeKind: "lez",
    isRestriction: true,
    sourceUrl: "https://www.glasgow.gov.uk/lez",
    operatorUrl: "https://www.lowemissionzones.scot/",
    geometry: box(-4.275, 55.854, -4.235, 55.87),
  }),
  zone({
    id: "edinburgh-lez",
    name: "Edinburgh Low Emission Zone",
    authority: "City of Edinburgh Council",
    schemeKind: "lez",
    isRestriction: true,
    sourceUrl: "https://www.edinburgh.gov.uk/lez",
    operatorUrl: "https://www.lowemissionzones.scot/",
    geometry: box(-3.215, 55.946, -3.175, 55.958),
  }),
];

export const TOLL_CATALOGUE: ChargeScheme[] = [
  zone({
    id: "dart-charge",
    name: "Dart Charge",
    authority: "National Highways",
    schemeKind: "toll",
    chargePenceByClass: { car: 250, van: 300, motorcycle: 250 },
    isRestriction: false,
    appliesHours: HOURS_DART,
    sourceUrl: "https://www.gov.uk/dart-charge",
    operatorUrl: "https://www.gov.uk/dart-charge",
    geometry: box(0.23, 51.455, 0.29, 51.478),
  }),
  zone({
    id: "m6-toll",
    name: "M6 Toll",
    authority: "Midland Expressway Limited",
    schemeKind: "toll",
    chargePenceByClass: { car: 880, van: 1760, motorcycle: 500 },
    isRestriction: false,
    sourceUrl: "https://www.m6toll.co.uk/pricing/",
    operatorUrl: "https://www.m6toll.co.uk/pricing/",
    geometry: box(-2.05, 52.49, -1.68, 52.705),
  }),
  zone({
    id: "mersey-gateway",
    name: "Mersey Gateway",
    authority: "Merseyflow",
    schemeKind: "toll",
    chargePenceByClass: { car: 200, van: 400, motorcycle: 100 },
    isRestriction: false,
    sourceUrl: "https://www.merseyflow.co.uk/",
    operatorUrl: "https://www.merseyflow.co.uk/",
    geometry: box(-2.745, 53.335, -2.715, 53.355),
  }),
  zone({
    id: "tyne-tunnel",
    name: "Tyne Tunnel",
    authority: "TT2",
    schemeKind: "toll",
    chargePenceByClass: { car: 230, van: 460, motorcycle: 110 },
    isRestriction: false,
    sourceUrl: "https://www.tt2.co.uk/tolls/",
    operatorUrl: "https://www.tt2.co.uk/tolls/",
    geometry: box(-1.49, 54.988, -1.45, 55.01),
  }),
];

export const CHARGE_CATALOGUE: ChargeScheme[] = [...ZONE_CATALOGUE, ...TOLL_CATALOGUE];

export function schemeById(id: string): ChargeScheme | undefined {
  return CHARGE_CATALOGUE.find((s) => s.id === id);
}
