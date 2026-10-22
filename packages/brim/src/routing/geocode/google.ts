import type { AutocompleteOpts, GeocodeHit, Geocoder, PlaceSuggestion } from "./types.js";
import { RoutingError } from "../types.js";

const AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";
const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const ROADS_URL = "https://roads.googleapis.com/v1/snapToRoads";
const UK_RECT = {
  low: { latitude: 49.8, longitude: -8.2 },
  high: { latitude: 58.7, longitude: 1.8 },
};

function placeResource(placeId: string): string {
  return placeId.startsWith("places/") ? placeId : `places/${placeId}`;
}

export class GoogleGeocoder implements Geocoder {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async autocomplete(query: string, opts?: AutocompleteOpts): Promise<PlaceSuggestion[]> {
    if (query.trim().length < 2) return [];
    const body: Record<string, unknown> = {
      input: query.trim(),
      includedRegionCodes: ["gb"],
      locationBias: { rectangle: UK_RECT },
    };
    if (opts?.session) body.sessionToken = opts.session;
    if (opts?.bias) {
      body.locationBias = {
        circle: {
          center: { latitude: opts.bias.lat, longitude: opts.bias.lng },
          radius: 50_000,
        },
      };
    }
    const res = await this.fetchImpl(AUTOCOMPLETE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.apiKey,
        "X-Goog-FieldMask":
          "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text",
      },
      body: JSON.stringify(body),
    });
    if (res.status === 401 || res.status === 403) throw new RoutingError("auth", "Google places auth failed");
    if (res.status === 429) throw new RoutingError("quota", "Google places quota exceeded");
    if (!res.ok) throw new RoutingError("upstream", `Google places ${res.status}`);
    const json = (await res.json()) as {
      suggestions?: Array<{ placePrediction?: { placeId?: string; text?: { text?: string } } }>;
    };
    const out: PlaceSuggestion[] = [];
    for (const s of json.suggestions ?? []) {
      const label = s.placePrediction?.text?.text;
      const placeId = s.placePrediction?.placeId;
      if (!label || !placeId) continue;
      out.push({ label, placeId });
    }
    return out;
  }

  async resolve(placeId: string, opts?: { session?: string }): Promise<GeocodeHit | undefined> {
    const url = new URL(`https://places.googleapis.com/v1/${placeResource(placeId)}`);
    if (opts?.session) url.searchParams.set("sessionToken", opts.session);
    const res = await this.fetchImpl(url.toString(), {
      headers: {
        "X-Goog-Api-Key": this.apiKey,
        "X-Goog-FieldMask": "id,formattedAddress,location",
      },
    });
    if (res.status === 401 || res.status === 403) throw new RoutingError("auth", "Google places auth failed");
    if (res.status === 429) throw new RoutingError("quota", "Google places quota exceeded");
    if (res.status === 404) return undefined;
    if (!res.ok) throw new RoutingError("upstream", `Google place details ${res.status}`);
    const json = (await res.json()) as {
      id?: string;
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
    };
    if (json.location?.latitude === undefined || json.location.longitude === undefined) return undefined;
    const hit: GeocodeHit = {
      label: json.formattedAddress ?? placeId,
      lat: json.location.latitude,
      lng: json.location.longitude,
    };
    if (json.id) hit.placeId = json.id;
    else hit.placeId = placeId;
    return hit;
  }

  async reverse(lat: number, lng: number): Promise<GeocodeHit | undefined> {
    const preferred = await this.reverseOnce(lat, lng, "street_address|route|premise");
    if (preferred) return preferred;
    return this.reverseOnce(lat, lng);
  }

  private async reverseOnce(
    lat: number,
    lng: number,
    resultType?: string,
  ): Promise<GeocodeHit | undefined> {
    const url = new URL(GEOCODE_URL);
    url.searchParams.set("latlng", `${lat},${lng}`);
    url.searchParams.set("region", "gb");
    url.searchParams.set("key", this.apiKey);
    if (resultType) url.searchParams.set("result_type", resultType);
    const res = await this.fetchImpl(url.toString());
    if (res.status === 401 || res.status === 403) throw new RoutingError("auth", "Google geocode auth failed");
    if (res.status === 429) throw new RoutingError("quota", "Google geocode quota exceeded");
    if (!res.ok) throw new RoutingError("upstream", `Google geocode ${res.status}`);
    const json = (await res.json()) as {
      status?: string;
      results?: Array<{
        formatted_address?: string;
        geometry?: { location?: { lat?: number; lng?: number } };
        place_id?: string;
      }>;
    };
    const row = json.results?.[0];
    const loc = row?.geometry?.location;
    if (!row?.formatted_address || loc?.lat === undefined || loc.lng === undefined) return undefined;
    const hit: GeocodeHit = { label: row.formatted_address, lat: loc.lat, lng: loc.lng };
    if (row.place_id) hit.placeId = row.place_id;
    return hit;
  }

  async snap(lat: number, lng: number): Promise<{ lat: number; lng: number }> {
    const url = new URL(ROADS_URL);
    url.searchParams.set("path", `${lat},${lng}`);
    url.searchParams.set("interpolate", "false");
    url.searchParams.set("key", this.apiKey);
    const res = await this.fetchImpl(url.toString());
    if (!res.ok) return { lat, lng };
    const json = (await res.json()) as {
      snappedPoints?: Array<{ location?: { latitude?: number; longitude?: number } }>;
    };
    const loc = json.snappedPoints?.[0]?.location;
    if (loc?.latitude === undefined || loc.longitude === undefined) return { lat, lng };
    return { lat: loc.latitude, lng: loc.longitude };
  }
}
