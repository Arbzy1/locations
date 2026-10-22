import { cachedRoute, roundCoord, type CacheStore } from "../cache.js";
import type { AutocompleteOpts, GeocodeHit, Geocoder, PlaceSuggestion } from "./types.js";

export function roundCoord4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

const DAY = 24 * 3600;

export class CachedGeocoder implements Geocoder {
  constructor(
    private readonly inner: Geocoder,
    private readonly cache: CacheStore,
  ) {}

  async autocomplete(query: string, opts?: AutocompleteOpts): Promise<PlaceSuggestion[]> {
    const bias = opts?.bias ? `${roundCoord(opts.bias.lat)},${roundCoord(opts.bias.lng)}` : "";
    const key = `geo:ac:${query.trim().toLowerCase()}|${bias}`;
    const { value } = await cachedRoute(this.cache, key, DAY, () => this.inner.autocomplete(query, opts));
    return value;
  }

  async resolve(placeId: string, opts?: { session?: string }): Promise<GeocodeHit | undefined> {
    const key = `geo:id:${placeId}`;
    const { value } = await cachedRoute(this.cache, key, 30 * DAY, () => this.inner.resolve(placeId, opts));
    return value;
  }

  async reverse(lat: number, lng: number): Promise<GeocodeHit | undefined> {
    const key = `geo:rev:${roundCoord4(lat)},${roundCoord4(lng)}`;
    const { value } = await cachedRoute(this.cache, key, DAY, () => this.inner.reverse(lat, lng));
    return value;
  }

  async snap(lat: number, lng: number): Promise<{ lat: number; lng: number }> {
    const key = `geo:snap:${roundCoord4(lat)},${roundCoord4(lng)}`;
    const { value } = await cachedRoute(this.cache, key, DAY, () => this.inner.snap(lat, lng));
    return value;
  }
}
