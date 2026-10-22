export const FUEL_GRADES = ["E10", "E5", "B7", "SDV", "LPG"] as const;
export type FuelGrade = (typeof FUEL_GRADES)[number];

export const FUEL_FINDER_TYPES = [
  "E10",
  "E5",
  "B7_STANDARD",
  "B7_PREMIUM",
  "B10",
  "HVO",
] as const;
export type FuelFinderType = (typeof FUEL_FINDER_TYPES)[number];

export type FuelFinderLocation = {
  address_line_1?: string | null;
  address_line_2?: string | null;
  city?: string | null;
  country?: string | null;
  county?: string | null;
  postcode?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
};

export type FuelFinderPfs = {
  node_id?: string | null;
  trading_name?: string | null;
  brand_name?: string | null;
  temporary_closure?: boolean | null;
  permanent_closure?: boolean | null;
  location?: FuelFinderLocation | null;
  opening_times?: unknown;
  fuel_types?: string[] | null;
};

export type FuelFinderPriceEntry = {
  price?: string | number | null;
  fuel_type?: string | null;
  price_last_updated?: string | null;
};

export type FuelFinderPriceRow = {
  node_id?: string | null;
  trading_name?: string | null;
  fuel_prices?: FuelFinderPriceEntry[] | null;
};

export type FuelFinderSkip = {
  reason: string;
  nodeId?: string;
  fuelType?: string;
};

export type NormalisedStation = {
  id: string;
  brand?: string;
  brandCanonical: string;
  name: string;
  address?: string;
  postcode?: string;
  lat: number;
  lng: number;
  openingHoursJson?: unknown;
  lastSeenAt?: string;
  isStale: boolean;
};

export type NormalisedPrice = {
  stationId: string;
  grade: FuelGrade;
  priceTenthsPence: number;
  observedAt: string;
  rawPayloadJson: unknown;
};

export type FuelFinderNormaliseResult = {
  stations: NormalisedStation[];
  prices: NormalisedPrice[];
  skipped: FuelFinderSkip[];
};

export type PriceObservation = {
  stationId: string;
  grade: FuelGrade;
  priceTenthsPence: number;
  observedAt: string;
  lat: number;
  lng: number;
  isStale: boolean;
};

export type ResolvedFuelPrice = {
  pence: number;
  source:
    | "user-picked-station"
    | "home-area-median"
    | "national-median"
    | "hardcoded-fallback";
  observedAt: string;
  stationId?: string;
  warning?: { code: string; message: string; severity: "info" | "warning" | "blocking" };
  reason: string;
};
