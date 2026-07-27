/** Fictional demo places — never call Nominatim for these. */
export const DEMO_PLACES: Record<
  string,
  { name: string; address: string; short_address: string; cluster: string }
> = {
  demo_home_brooklyn: {
    name: "Demo Home",
    address: "Sample Street, Brooklyn Demo District",
    short_address: "Sample Street, Brooklyn",
    cluster: "Brooklyn (Demo)",
  },
  demo_office_midtown: {
    name: "Demo Office",
    address: "100 Example Ave, Midtown Demo",
    short_address: "Example Ave, Midtown",
    cluster: "Midtown Manhattan (Demo)",
  },
  demo_cafe_midtown: {
    name: "Demo Cafe",
    address: "42 Fiction Lane, Midtown Demo",
    short_address: "Fiction Lane, Midtown",
    cluster: "Midtown Manhattan (Demo)",
  },
  demo_boston_harbor: {
    name: "Demo Harbor Walk",
    address: "Harbor Demo Pier, Boston Sample",
    short_address: "Harbor Pier, Boston",
    cluster: "Boston (Demo)",
  },
  demo_store_herald: {
    name: "Demo Market",
    address: "7 Placeholder Plaza, Midtown Demo",
    short_address: "Placeholder Plaza, Midtown",
    cluster: "Midtown Manhattan (Demo)",
  },
  demo_museum_park: {
    name: "Demo Museum",
    address: "1 Gallery Row, Upper East Demo",
    short_address: "Gallery Row, Upper East",
    cluster: "Upper East Side (Demo)",
  },
};

/** Rounded coord → demo place id for day-view enrichment */
export const DEMO_COORD_TO_PLACE: Record<string, string> = {
  "40.67820,-73.94420": "demo_home_brooklyn",
  "40.75490,-73.98400": "demo_office_midtown",
  "40.76140,-73.97760": "demo_cafe_midtown",
  "42.36010,-71.05890": "demo_boston_harbor",
  "40.74840,-73.98570": "demo_store_herald",
  "40.77940,-73.96320": "demo_museum_park",
};

export function demoPlaceKey(lat: number, lon: number): string {
  return `${lat.toFixed(5)},${lon.toFixed(5)}`;
}

export function resolveDemoPlace(lat: number, lon: number, placeId?: string | null) {
  const id =
    (placeId && DEMO_PLACES[placeId] ? placeId : null) ||
    DEMO_COORD_TO_PLACE[demoPlaceKey(lat, lon)] ||
    null;
  if (id && DEMO_PLACES[id]) {
    return { id, ...DEMO_PLACES[id] };
  }
  return {
    id: null,
    name: "Demo Place",
    address: "Fictional demo location",
    short_address: "Demo District",
    cluster: "Demo City",
  };
}
