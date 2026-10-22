import { findPlaceByLabel, nearestPlace, parseLatLngString } from '../shared/index.js';
import { roundCoord } from "./cache.js";
import type { RoutePlace } from "./types.js";

export function googlePlace(place: RoutePlace): Record<string, unknown> {
  if (typeof place !== "string") {
    return { location: { latLng: { latitude: place.lat, longitude: place.lng } } };
  }
  const parsed = parseLatLngString(place);
  if (parsed) {
    return { location: { latLng: { latitude: parsed.lat, longitude: parsed.lng } } };
  }
  return { address: place };
}

export function osrmCoord(place: RoutePlace): string {
  if (typeof place !== "string") return `${place.lng},${place.lat}`;
  const parsed = parseLatLngString(place);
  if (parsed) return `${parsed.lng},${parsed.lat}`;
  return encodeURIComponent(place);
}

export function fixturePlaceKey(place: RoutePlace): string {
  if (typeof place === "string") {
    const parsed = parseLatLngString(place);
    if (parsed) {
      return nearestPlace(parsed.lat, parsed.lng)?.label.toLowerCase() ?? place.toLowerCase();
    }
    return findPlaceByLabel(place)?.label.toLowerCase() ?? place.toLowerCase();
  }
  if (place.label) {
    return findPlaceByLabel(place.label)?.label.toLowerCase() ?? place.label.toLowerCase();
  }
  return nearestPlace(place.lat, place.lng)?.label.toLowerCase() ?? `${place.lat},${place.lng}`;
}

export function cachePlaceKey(place: RoutePlace): string {
  if (typeof place !== "string") {
    return `${roundCoord(place.lat)},${roundCoord(place.lng)}`;
  }
  const parsed = parseLatLngString(place);
  if (parsed) return `${roundCoord(parsed.lat)},${roundCoord(parsed.lng)}`;
  return place.toLowerCase();
}
