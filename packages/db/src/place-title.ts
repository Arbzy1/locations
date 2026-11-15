import { haversineM } from "./geo.js";

/** A building or named place is used only when it sits this close to the stay. */
export const BUILDING_NEAR_M = 40;

export type PlaceTitleKind = "building" | "road" | "none";

export type PlaceTitle = {
  name: string;
  kind: PlaceTitleKind;
};

type Address = Record<string, string>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function addressOf(raw: Record<string, unknown> | null): Address {
  const address = asRecord(raw?.address);
  if (!address) return {};
  const out: Address = {};
  for (const [key, value] of Object.entries(address)) {
    if (typeof value === "string" && value.trim()) out[key] = value.trim();
  }
  return out;
}

function featurePoint(raw: Record<string, unknown> | null): { lat: number; lon: number } | null {
  if (!raw) return null;
  const lat = typeof raw.lat === "number" ? raw.lat : typeof raw.lat === "string" ? Number(raw.lat) : NaN;
  const lon = typeof raw.lon === "number" ? raw.lon : typeof raw.lon === "string" ? Number(raw.lon) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

/** A POI or building name, skipping a value that is only the road. */
function buildingName(raw: Record<string, unknown> | null, address: Address): string {
  const named = typeof raw?.name === "string" ? raw.name.trim() : "";
  const road = address.road ?? "";
  const candidates = [named, address.amenity, address.shop, address.tourism, address.building];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (road && candidate === road) continue;
    return candidate;
  }
  return "";
}

/**
 * Title for one reverse-geocode result. A building, shop, amenity or tourist
 * site is used only when that feature is within BUILDING_NEAR_M of the stay.
 * Otherwise the road. With no coordinates on the result, a building name is
 * not kept: only the road, if the address has one.
 */
export function titleFromGeocode(queryLat: number, queryLon: number, raw: unknown): PlaceTitle {
  const record = asRecord(raw);
  const address = addressOf(record);
  const road = address.road ?? "";
  const point = featurePoint(record);
  const near = point != null && haversineM(queryLat, queryLon, point.lat, point.lon) <= BUILDING_NEAR_M;
  if (near) {
    const building = buildingName(record, address);
    if (building) return { name: building, kind: "building" };
  }
  if (road) return { name: road, kind: "road" };
  return { name: "", kind: "none" };
}

/** `place_cache.data` is either the geocode body or `{ raw, address }`. */
export function titleFromPlaceCache(queryLat: number, queryLon: number, data: unknown): PlaceTitle {
  const record = asRecord(data);
  const raw = asRecord(record?.raw) ?? record;
  return titleFromGeocode(queryLat, queryLon, raw);
}

function isHomeOrWork(type: string): boolean {
  const lower = type.toLowerCase();
  return lower === "home" || lower === "work" || lower.endsWith(" home") || lower.endsWith(" work");
}

/**
 * When the geocode title is only a road, add Google's place type:
 * "Restaurant, Mill Lane". Home, Work and Unknown stay as the road alone.
 */
export function titleWithType(title: PlaceTitle, semanticType: string | null | undefined): string {
  if (!title.name) return "";
  if (title.kind !== "road") return title.name;
  const type = (semanticType ?? "").trim();
  if (!type || type.toLowerCase() === "unknown" || isHomeOrWork(type)) return title.name;
  return `${type}, ${title.name}`;
}
