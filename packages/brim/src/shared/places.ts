export type PlaceHit = {
  label: string;
  lat: number;
  lng: number;
  placeId?: string;
};

export function fixturePlaceId(label: string): string {
  return `fixture:${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

export const UK_PLACES: PlaceHit[] = [
  { label: "Crawley", lat: 51.1092, lng: -0.1872 },
  { label: "London", lat: 51.5074, lng: -0.1278 },
  { label: "Manchester", lat: 53.4808, lng: -2.2426 },
  { label: "Leeds", lat: 53.8008, lng: -1.5491 },
  { label: "Birmingham", lat: 52.4862, lng: -1.8904 },
  { label: "Bristol", lat: 51.4545, lng: -2.5879 },
  { label: "Edinburgh", lat: 55.9533, lng: -3.1883 },
  { label: "Glasgow", lat: 55.8642, lng: -4.2518 },
  { label: "Cardiff", lat: 51.4816, lng: -3.1791 },
  { label: "Swansea", lat: 51.6214, lng: -3.9436 },
  { label: "Newcastle", lat: 54.9783, lng: -1.6178 },
  { label: "York", lat: 53.96, lng: -1.0873 },
  { label: "Station Road, Crawley", lat: 51.1139, lng: -0.187 },
  { label: "High Street, Crawley", lat: 51.1145, lng: -0.1878 },
  { label: "Victoria Street, London", lat: 51.4975, lng: -0.1372 },
  { label: "Deansgate, Manchester", lat: 53.4787, lng: -2.248 },
  { label: "Bath", lat: 51.3811, lng: -2.359 },
  { label: "Dartford", lat: 51.4464, lng: 0.2165 },
  { label: "Thurrock", lat: 51.4781, lng: 0.3268 },
  { label: "Coleshill", lat: 52.4995, lng: -1.7066 },
  { label: "Cannock", lat: 52.689, lng: -2.0307 },
  { label: "Runcorn", lat: 53.341, lng: -2.731 },
  { label: "Widnes", lat: 53.363, lng: -2.728 },
  { label: "Jarrow", lat: 54.981, lng: -1.47 },
  { label: "Howdon", lat: 54.997, lng: -1.474 },
].map((p) => ({ ...p, placeId: fixturePlaceId(p.label) }));

export function searchPlaces(query: string, places: PlaceHit[] = UK_PLACES): PlaceHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 1) return places.slice(0, 8);
  return places.filter((p) => p.label.toLowerCase().includes(q)).slice(0, 8);
}

export function findPlaceByLabel(label: string, places: PlaceHit[] = UK_PLACES): PlaceHit | undefined {
  const q = label.trim().toLowerCase();
  return places.find((p) => p.label.toLowerCase() === q);
}

export function nearestPlace(
  lat: number,
  lng: number,
  places: PlaceHit[] = UK_PLACES,
): PlaceHit | undefined {
  let best: PlaceHit | undefined;
  let bestD = Infinity;
  for (const p of places) {
    const d = (p.lat - lat) ** 2 + (p.lng - lng) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function findPlaceById(placeId: string, places: PlaceHit[] = UK_PLACES): PlaceHit | undefined {
  return places.find((p) => p.placeId === placeId);
}

/** Reverse-geocode a pin against the gazetteer. Beyond 200 m we do not invent a street. */
export function reverseGazetteer(
  lat: number,
  lng: number,
  places: PlaceHit[] = UK_PLACES,
  maxMeters = 200,
): PlaceHit {
  const near = nearestPlace(lat, lng, places);
  if (near && distanceMeters({ lat, lng }, near) <= maxMeters) return near;
  return {
    label: `Pinned location (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
    lat,
    lng,
  };
}
