import type { ChargeKind, VehicleProfile } from "../types.js";
import { findPlaceByLabel } from "../places.js";
import { CHARGE_CATALOGUE, schemeById } from "../zones/catalogue.js";
import { detectHitsFromLine } from "../zones/detect.js";
import type { ChargeHit } from "../zones/types.js";

export type ChargeJourneyExpected = {
  schemeId: string;
  pence: number;
  count?: number;
  kind?: ChargeKind;
};

export type ChargeJourneyCase = {
  id: string;
  origin: string;
  destination: string;
  vehicle: VehicleProfile;
  departsAt: string;
  durationSeconds: number;
  expected: ChargeJourneyExpected[];
  expectedWarningCodes?: string[];
  extraHits?: string[];
  hitIds?: string[];
  nearMissIds?: string[];
};

const WEEKDAY_AM = "2026-08-14T08:00:00Z";
const SAT_PM = "2026-08-15T13:00:00Z";
const SUN_AM = "2026-08-16T09:00:00Z";
const FRI_EVE = "2026-08-14T19:00:00Z";
const CHRISTMAS = "2026-12-25T10:00:00Z";
const OVERNIGHT = "2026-08-14T22:30:00+01:00";
const DST_SPRING = "2026-03-29T00:30:00Z";
const DST_AUTUMN = "2026-10-25T00:30:00Z";
const DART_NIGHT = "2026-08-14T22:30:00Z";
const BRISTOL_LATE = "2026-08-14T15:30:00Z";

function car(partial: Partial<VehicleProfile> & Pick<VehicleProfile, "propulsion">): VehicleProfile {
  return { kind: "car", ...partial };
}

function asHits(ids: string[], relation: ChargeHit["relation"]): ChargeHit[] {
  const hits: ChargeHit[] = [];
  for (const id of ids) {
    const scheme = schemeById(id);
    if (scheme) hits.push({ scheme, relation });
  }
  return hits;
}

export function journeyHits(c: ChargeJourneyCase): ChargeHit[] {
  if (c.hitIds) {
    return [...asHits(c.hitIds, "intersects"), ...asHits(c.nearMissIds ?? [], "near")];
  }
  const origin = findPlaceByLabel(c.origin);
  const dest = findPlaceByLabel(c.destination);
  if (!origin || !dest) return [];
  const points = [
    { lat: origin.lat, lng: origin.lng },
    { lat: (origin.lat + dest.lat) / 2, lng: (origin.lng + dest.lng) / 2 },
    { lat: dest.lat, lng: dest.lng },
  ];
  return [
    ...detectHitsFromLine(points, CHARGE_CATALOGUE),
    ...asHits(c.extraHits ?? [], "intersects"),
    ...asHits(c.nearMissIds ?? [], "near"),
  ];
}

const petrolUnknown = car({ propulsion: "petrol" });
const petrolEuro4 = car({
  propulsion: "petrol",
  euroStatus: "Euro 4",
  euroStatusSource: "derived",
});
const petrolEuro4Year = car({ propulsion: "petrol", year: 2008 });
const dieselEuro5 = car({
  propulsion: "diesel",
  euroStatus: "Euro 5",
  euroStatusSource: "derived",
});
const dieselEuro6Dvla = car({
  propulsion: "diesel",
  euroStatus: "Euro 6",
  euroStatusSource: "dvla",
});
const bev = car({ propulsion: "bev" });
const phevEuro4 = car({
  propulsion: "phev",
  euroStatus: "Euro 4",
  euroStatusSource: "derived",
});
const vanDieselEuro5: VehicleProfile = {
  kind: "van",
  propulsion: "diesel",
  euroStatus: "Euro 5",
  euroStatusSource: "derived",
};
const motoEuro2: VehicleProfile = {
  kind: "motorcycle",
  propulsion: "petrol",
  euroStatus: "Euro 2",
  euroStatusSource: "derived",
};
const motoEuro3: VehicleProfile = {
  kind: "motorcycle",
  propulsion: "petrol",
  euroStatus: "Euro 3",
  euroStatusSource: "derived",
};

export const CHARGE_JOURNEY_SET: ChargeJourneyCase[] = [
  {
    id: "crawley-london-weekday-unknown",
    origin: "Crawley",
    destination: "London",
    vehicle: petrolUnknown,
    departsAt: WEEKDAY_AM,
    durationSeconds: 4200,
    expected: [
      { schemeId: "london-ulez", pence: 1250 },
      { schemeId: "london-cc", pence: 1500 },
    ],
    expectedWarningCodes: ["unknown-euro"],
  },
  {
    id: "crawley-london-petrol-euro4",
    origin: "Crawley",
    destination: "London",
    vehicle: petrolEuro4,
    departsAt: WEEKDAY_AM,
    durationSeconds: 4200,
    expected: [{ schemeId: "london-cc", pence: 1500 }],
  },
  {
    id: "crawley-london-diesel-euro5",
    origin: "Crawley",
    destination: "London",
    vehicle: dieselEuro5,
    departsAt: WEEKDAY_AM,
    durationSeconds: 4200,
    expected: [
      { schemeId: "london-ulez", pence: 1250 },
      { schemeId: "london-cc", pence: 1500 },
    ],
  },
  {
    id: "crawley-london-diesel-euro6-dvla",
    origin: "Crawley",
    destination: "London",
    vehicle: dieselEuro6Dvla,
    departsAt: WEEKDAY_AM,
    durationSeconds: 4200,
    expected: [{ schemeId: "london-cc", pence: 1500 }],
  },
  {
    id: "crawley-london-bev",
    origin: "Crawley",
    destination: "London",
    vehicle: bev,
    departsAt: WEEKDAY_AM,
    durationSeconds: 4200,
    expected: [{ schemeId: "london-cc", pence: 1500 }],
  },
  {
    id: "crawley-london-phev-euro4",
    origin: "Crawley",
    destination: "London",
    vehicle: phevEuro4,
    departsAt: WEEKDAY_AM,
    durationSeconds: 4200,
    expected: [{ schemeId: "london-cc", pence: 1500 }],
  },
  {
    id: "crawley-london-saturday-cc",
    origin: "Crawley",
    destination: "London",
    vehicle: petrolEuro4,
    departsAt: SAT_PM,
    durationSeconds: 4200,
    expected: [{ schemeId: "london-cc", pence: 1500 }],
  },
  {
    id: "crawley-london-sunday-morning",
    origin: "Crawley",
    destination: "London",
    vehicle: petrolEuro4,
    departsAt: SUN_AM,
    durationSeconds: 4200,
    expected: [],
  },
  {
    id: "crawley-london-friday-evening",
    origin: "Crawley",
    destination: "London",
    vehicle: petrolEuro4,
    departsAt: FRI_EVE,
    durationSeconds: 4200,
    expected: [],
  },
  {
    id: "crawley-london-christmas",
    origin: "Crawley",
    destination: "London",
    vehicle: dieselEuro5,
    departsAt: CHRISTMAS,
    durationSeconds: 4200,
    expected: [],
  },
  {
    id: "crawley-london-same-day-return",
    origin: "Crawley",
    destination: "London",
    vehicle: dieselEuro5,
    departsAt: WEEKDAY_AM,
    durationSeconds: 4200,
    extraHits: ["london-ulez", "london-cc"],
    expected: [
      { schemeId: "london-ulez", pence: 1250, count: 1 },
      { schemeId: "london-cc", pence: 1500, count: 1 },
    ],
  },
  {
    id: "crawley-london-overnight",
    origin: "Crawley",
    destination: "London",
    vehicle: dieselEuro5,
    departsAt: OVERNIGHT,
    durationSeconds: 3 * 3600,
    expected: [{ schemeId: "london-ulez", pence: 2500, count: 2 }],
  },
  {
    id: "crawley-london-dst-spring",
    origin: "Crawley",
    destination: "London",
    vehicle: dieselEuro5,
    departsAt: DST_SPRING,
    durationSeconds: 7200,
    expected: [{ schemeId: "london-ulez", pence: 1250 }],
  },
  {
    id: "crawley-london-dst-autumn",
    origin: "Crawley",
    destination: "London",
    vehicle: dieselEuro5,
    departsAt: DST_AUTUMN,
    durationSeconds: 7200,
    expected: [{ schemeId: "london-ulez", pence: 1250 }],
  },
  {
    id: "crawley-london-derived-year",
    origin: "Crawley",
    destination: "London",
    vehicle: petrolEuro4Year,
    departsAt: WEEKDAY_AM,
    durationSeconds: 4200,
    expected: [{ schemeId: "london-cc", pence: 1500 }],
    expectedWarningCodes: ["derived-euro"],
  },
  {
    id: "crawley-london-moto-euro2",
    origin: "Crawley",
    destination: "London",
    vehicle: motoEuro2,
    departsAt: WEEKDAY_AM,
    durationSeconds: 4200,
    expected: [{ schemeId: "london-ulez", pence: 1250 }],
  },
  {
    id: "crawley-london-moto-euro3",
    origin: "Crawley",
    destination: "London",
    vehicle: motoEuro3,
    departsAt: WEEKDAY_AM,
    durationSeconds: 4200,
    expected: [],
  },
  {
    id: "birmingham-diesel-euro5-car",
    origin: "Birmingham",
    destination: "Bristol",
    vehicle: dieselEuro5,
    departsAt: WEEKDAY_AM,
    durationSeconds: 7200,
    expected: [
      { schemeId: "birmingham-caz", pence: 800 },
      { schemeId: "bristol-caz", pence: 900 },
    ],
  },
  {
    id: "birmingham-petrol-euro4-car",
    origin: "Birmingham",
    destination: "Bristol",
    vehicle: petrolEuro4,
    departsAt: WEEKDAY_AM,
    durationSeconds: 7200,
    expected: [],
  },
  {
    id: "birmingham-van-diesel-euro5",
    origin: "Birmingham",
    destination: "Bristol",
    vehicle: vanDieselEuro5,
    departsAt: WEEKDAY_AM,
    durationSeconds: 7200,
    expected: [
      { schemeId: "birmingham-caz", pence: 800 },
      { schemeId: "bristol-caz", pence: 900 },
    ],
  },
  {
    id: "bath-car-diesel-euro5",
    origin: "Bristol",
    destination: "Bath",
    vehicle: dieselEuro5,
    departsAt: WEEKDAY_AM,
    durationSeconds: 2400,
    expected: [{ schemeId: "bristol-caz", pence: 900 }],
  },
  {
    id: "bath-van-diesel-euro5",
    origin: "Bristol",
    destination: "Bath",
    vehicle: vanDieselEuro5,
    departsAt: WEEKDAY_AM,
    durationSeconds: 2400,
    expected: [
      { schemeId: "bristol-caz", pence: 900 },
      { schemeId: "bath-caz", pence: 900 },
    ],
  },
  {
    id: "bath-car-only",
    origin: "Bath",
    destination: "Bath",
    vehicle: dieselEuro5,
    departsAt: WEEKDAY_AM,
    durationSeconds: 600,
    hitIds: ["bath-caz"],
    expected: [],
  },
  {
    id: "bristol-saturday",
    origin: "Bristol",
    destination: "Bath",
    vehicle: dieselEuro5,
    departsAt: SAT_PM,
    durationSeconds: 2400,
    expected: [],
  },
  {
    id: "bristol-after-hours",
    origin: "Bristol",
    destination: "Bath",
    vehicle: dieselEuro5,
    departsAt: BRISTOL_LATE,
    durationSeconds: 2400,
    expected: [],
  },
  {
    id: "glasgow-lez-diesel-euro5",
    origin: "Edinburgh",
    destination: "Glasgow",
    vehicle: dieselEuro5,
    departsAt: WEEKDAY_AM,
    durationSeconds: 3900,
    expected: [
      { schemeId: "edinburgh-lez", pence: 0, kind: "restriction" },
      { schemeId: "glasgow-lez", pence: 0, kind: "restriction" },
    ],
    expectedWarningCodes: ["restriction"],
  },
  {
    id: "glasgow-lez-bev",
    origin: "Edinburgh",
    destination: "Glasgow",
    vehicle: bev,
    departsAt: WEEKDAY_AM,
    durationSeconds: 3900,
    expected: [],
  },
  {
    id: "glasgow-lez-petrol-euro4",
    origin: "Edinburgh",
    destination: "Glasgow",
    vehicle: petrolEuro4,
    departsAt: WEEKDAY_AM,
    durationSeconds: 3900,
    expected: [],
  },
  {
    id: "glasgow-lez-van",
    origin: "Edinburgh",
    destination: "Glasgow",
    vehicle: vanDieselEuro5,
    departsAt: WEEKDAY_AM,
    durationSeconds: 3900,
    expected: [
      { schemeId: "edinburgh-lez", pence: 0, kind: "restriction" },
      { schemeId: "glasgow-lez", pence: 0, kind: "restriction" },
    ],
  },
  {
    id: "dart-day-car",
    origin: "Dartford",
    destination: "Thurrock",
    vehicle: petrolEuro4,
    departsAt: WEEKDAY_AM,
    durationSeconds: 900,
    expected: [{ schemeId: "dart-charge", pence: 250, kind: "toll" }],
  },
  {
    id: "dart-night-free",
    origin: "Dartford",
    destination: "Thurrock",
    vehicle: petrolEuro4,
    departsAt: DART_NIGHT,
    durationSeconds: 900,
    expected: [],
  },
  {
    id: "dart-van",
    origin: "Dartford",
    destination: "Thurrock",
    vehicle: vanDieselEuro5,
    departsAt: WEEKDAY_AM,
    durationSeconds: 900,
    expected: [{ schemeId: "dart-charge", pence: 300, kind: "toll" }],
  },
  {
    id: "m6-toll-car",
    origin: "Coleshill",
    destination: "Cannock",
    vehicle: petrolEuro4,
    departsAt: WEEKDAY_AM,
    durationSeconds: 1500,
    expected: [{ schemeId: "m6-toll", pence: 880, kind: "toll" }],
  },
  {
    id: "m6-toll-motorcycle",
    origin: "Coleshill",
    destination: "Cannock",
    vehicle: motoEuro3,
    departsAt: WEEKDAY_AM,
    durationSeconds: 1500,
    expected: [{ schemeId: "m6-toll", pence: 500, kind: "toll" }],
  },
  {
    id: "mersey-gateway-car",
    origin: "Runcorn",
    destination: "Widnes",
    vehicle: petrolEuro4,
    departsAt: WEEKDAY_AM,
    durationSeconds: 480,
    expected: [{ schemeId: "mersey-gateway", pence: 200, kind: "toll" }],
  },
  {
    id: "tyne-tunnel-car",
    origin: "Jarrow",
    destination: "Howdon",
    vehicle: petrolEuro4,
    departsAt: WEEKDAY_AM,
    durationSeconds: 420,
    expected: [{ schemeId: "tyne-tunnel", pence: 230, kind: "toll" }],
  },
  {
    id: "manchester-leeds-none",
    origin: "Manchester",
    destination: "Leeds",
    vehicle: dieselEuro5,
    departsAt: WEEKDAY_AM,
    durationSeconds: 3600,
    expected: [],
  },
  {
    id: "cardiff-swansea-none",
    origin: "Cardiff",
    destination: "Swansea",
    vehicle: dieselEuro5,
    departsAt: WEEKDAY_AM,
    durationSeconds: 3600,
    expected: [],
  },
  {
    id: "newcastle-york-none",
    origin: "Newcastle",
    destination: "York",
    vehicle: dieselEuro5,
    departsAt: WEEKDAY_AM,
    durationSeconds: 5400,
    expected: [],
  },
  {
    id: "ulez-near-miss",
    origin: "Crawley",
    destination: "Crawley",
    vehicle: dieselEuro5,
    departsAt: WEEKDAY_AM,
    durationSeconds: 600,
    hitIds: [],
    nearMissIds: ["london-ulez"],
    expected: [],
    expectedWarningCodes: ["near-miss"],
  },
];
