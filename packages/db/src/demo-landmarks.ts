/**
 * Curated real landmark labels for demo place IDs.
 * Coords are real; labels match the landmark so the UI looks correct
 * even when Nominatim reverse-geocode is a bit off at street level.
 */
export const DEMO_LANDMARKS: Record<
  string,
  { name: string; address: string; short_address: string }
> = {
  demo_williamsburg: {
    name: "Williamsburg waterfront",
    address: "Kent Avenue, Williamsburg, Brooklyn, New York",
    short_address: "Kent Ave, Williamsburg, Brooklyn",
  },
  demo_empire_state: {
    name: "Empire State Building",
    address: "350 5th Avenue, Midtown Manhattan, New York",
    short_address: "5th Avenue, Midtown Manhattan",
  },
  demo_grand_central: {
    name: "Grand Central Terminal",
    address: "89 E 42nd Street, Midtown Manhattan, New York",
    short_address: "E 42nd Street, Midtown Manhattan",
  },
  demo_moma: {
    name: "Museum of Modern Art (MoMA)",
    address: "11 West 53rd Street, Midtown Manhattan, New York",
    short_address: "W 53rd Street, Midtown Manhattan",
  },
  demo_boston_common: {
    name: "Boston Common",
    address: "Boston Common, Boston, Massachusetts",
    short_address: "Boston Common, Boston",
  },
  demo_faneuil: {
    name: "Faneuil Hall Marketplace",
    address: "4 South Market Street, Boston, Massachusetts",
    short_address: "South Market St, Boston",
  },
  demo_times_square: {
    name: "Times Square",
    address: "Times Square, Midtown Manhattan, New York",
    short_address: "Times Square, Manhattan",
  },
  demo_central_park: {
    name: "Central Park (Bethesda Fountain)",
    address: "Central Park, Manhattan, New York",
    short_address: "Central Park, Manhattan",
  },
  demo_brooklyn_bridge: {
    name: "Brooklyn Bridge",
    address: "Brooklyn Bridge, New York",
    short_address: "Brooklyn Bridge, New York",
  },
};

export function landmarkForPlaceId(placeId: string | null | undefined) {
  if (!placeId) return null;
  return DEMO_LANDMARKS[placeId] ?? null;
}
