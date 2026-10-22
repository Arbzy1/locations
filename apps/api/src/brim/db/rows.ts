/** API-facing row shapes for journey cost tables (snake_case, optional fields omitted). */
export type VehicleRow = {
  id: string;
  tenant: string;
  nickname?: string;
  kind: 'car' | 'van' | 'motorcycle';
  propulsion: 'petrol' | 'diesel' | 'hybrid' | 'phev' | 'bev';
  make?: string;
  model?: string;
  derivative?: string;
  transmission?: string;
  year?: number;
  engine_cc?: number;
  co2_gkm?: number;
  euro_status?: string;
  euro_status_source?: 'dvla' | 'derived';
  official_consumption?: number;
  official_unit?: string;
  official_cycle?: string;
  tank_litres?: number;
  battery_kwh_usable?: number;
  has_heat_pump?: boolean;
  vca_match_id?: string;
  vrm_hash?: string;
  vrm_encrypted?: string;
  created_at: string;
};

export type TariffRow = {
  id: string;
  vehicle_id: string;
  kind: 'home' | 'public';
  pence_per_kwh: number;
  offpeak_pence?: number;
  offpeak_window?: string;
  network?: string;
  is_default: boolean;
};

export type JourneyRow = {
  id: string;
  tenant: string;
  vehicle_id?: string;
  origin_label: string;
  dest_label: string;
  distance_meters: number;
  duration_seconds: number;
  polyline?: string;
  departs_at?: string;
  estimate_json: unknown;
  charges_json: unknown;
  is_saved: boolean;
  created_at: string;
};

export type FillUpRow = {
  id: string;
  vehicle_id: string;
  odometer_miles: number;
  quantity: number;
  unit: 'litres' | 'kwh';
  price_pence: number;
  filled_to_brim: boolean;
  occurred_at: string;
  note?: string;
  station_id?: string;
};

export type CalibrationRow = {
  id: string;
  vehicle_id: string;
  calculated_value: number;
  unit: string;
  sample_count: number;
  stddev?: number;
  last_computed_at: string;
};

export type OwnerSettingsRow = {
  tenant: string;
  default_vehicle_id?: string;
  updated_at: string;
};

export type SavedPlaceRow = {
  id: string;
  tenant: string;
  kind: 'home' | 'work' | 'favourite';
  label: string;
  lat: number;
  lng: number;
  created_at: string;
};
