import type { CacheStore } from "../cache.js";
import { CachedGeocoder } from "./cache.js";
import { FixtureGeocoder } from "./fixture.js";
import { GoogleGeocoder } from "./google.js";
import { NominatimGeocoder } from "./nominatim.js";
import type { Geocoder } from "./types.js";

export function chooseGeocoder(input: {
  fixtureMode: boolean;
  googleKey?: string | undefined;
  geocodeBase?: string | undefined;
  cache: CacheStore;
  fetchImpl?: typeof fetch;
}): Geocoder {
  const inner = input.fixtureMode
    ? new FixtureGeocoder()
    : input.googleKey
      ? new GoogleGeocoder(input.googleKey, input.fetchImpl)
      : new NominatimGeocoder(input.geocodeBase, input.fetchImpl);
  return new CachedGeocoder(inner, input.cache);
}
