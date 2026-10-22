export type PlaceSuggestion = {
  label: string;
  placeId?: string;
  lat?: number;
  lng?: number;
};

export type GeocodeHit = {
  label: string;
  lat: number;
  lng: number;
  placeId?: string;
};

export type AutocompleteOpts = {
  session?: string;
  bias?: { lat: number; lng: number };
};

export interface Geocoder {
  autocomplete(query: string, opts?: AutocompleteOpts): Promise<PlaceSuggestion[]>;
  resolve(placeId: string, opts?: { session?: string }): Promise<GeocodeHit | undefined>;
  reverse(lat: number, lng: number): Promise<GeocodeHit | undefined>;
  snap(lat: number, lng: number): Promise<{ lat: number; lng: number }>;
}
