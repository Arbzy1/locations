export type Place = { label: string; lat: number; lng: number; placeId?: string };

export type Propulsion = "petrol" | "diesel" | "hybrid" | "phev" | "bev";

export type VehicleKind = "car" | "van" | "motorcycle";

export type FuelGrade = "E10" | "E5" | "B7" | "SDV" | "LPG";

export type Vehicle = {
  id: string;
  nickname?: string;
  propulsion: string;
  kind?: VehicleKind;
  make?: string;
  model?: string;
  year?: number;
  euro_status?: string;
  euro_status_source?: "dvla" | "derived";
  official_consumption?: number;
  official_unit?: string;
  official_cycle?: string;
  user_entered_consumption?: number;
  user_entered_unit?: string;
  tank_litres?: number;
  battery_kwh_usable?: number;
  is_default?: boolean;
  has_heat_pump?: boolean;
  vrm?: string;
};

export type SavedPlace = {
  id: string;
  kind: "home" | "work" | "favourite";
  label: string;
  lat: number;
  lng: number;
};

export type ViaDraft = { id: string; text: string; pin: Place | null };

export type FocusStop = "origin" | "destination" | number;

export type EvNetworkRow = {
  id: string;
  network: string;
  speed: "ac" | "dc";
  pencePerKwh: number;
};

export type Health = { status: string; fixtureMode: boolean };

export type MapBias = { lat: number; lng: number };
