export type ZoneKind = "ulez" | "congestion" | "caz" | "lez";
export type SchemeKind = ZoneKind | "toll";
export type CazClass = "C" | "D";
export type ChargeRelation = "intersects" | "near";

/** ISO weekday: 1 Monday ... 7 Sunday. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type ChargeHoursWindow = {
  days: IsoWeekday[];
  start: string;
  end: string;
};

export type ChargeHoursJson = {
  timezone: "Europe/London";
  always?: boolean;
  windows?: ChargeHoursWindow[];
  /** Recurring `MM-DD` or absolute `YYYY-MM-DD`. */
  exemptDates?: string[];
  /** Inclusive local ranges. `start` after `end` wraps the year (Christmas to New Year). */
  exemptRanges?: Array<{ start: string; end: string }>;
  /** Dates that use Saturday/Sunday windows (bank holidays for London CC). */
  weekendLikeDates?: string[];
};

export type ChargePenceByClass = {
  car?: number;
  van?: number;
  motorcycle?: number;
};

export type ZoneGeometry = {
  type: "Polygon" | "MultiPolygon";
  coordinates: number[][][] | number[][][][];
};

export type ChargeScheme = {
  id: string;
  name: string;
  authority?: string;
  schemeKind: SchemeKind;
  cazClass?: CazClass;
  chargePence?: number;
  chargePenceByClass?: ChargePenceByClass;
  isRestriction: boolean;
  appliesHours: ChargeHoursJson;
  sourceUrl: string;
  verifiedOn: string;
  operatorUrl: string;
  datasetVersion: string;
  geometry: ZoneGeometry;
};

export type ChargeHit = {
  scheme: ChargeScheme;
  relation: ChargeRelation;
};
