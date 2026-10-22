export type Place = { label: string; lat: number; lng: number; placeId?: string };

export type Vehicle = {
  id: string;
  nickname?: string;
  propulsion: string;
  make?: string;
  model?: string;
  is_default?: boolean;
  has_heat_pump?: boolean;
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

export type Propulsion = "petrol" | "diesel" | "hybrid" | "phev" | "bev";

export type VehicleKind = "car" | "van" | "motorcycle";

export type EvNetworkRow = {
  id: string;
  network: string;
  speed: "ac" | "dc";
  pencePerKwh: number;
};

export type Health = { status: string; fixtureMode: boolean };

export type MapBias = { lat: number; lng: number };
