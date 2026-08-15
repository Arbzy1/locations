import type { PlaceRankBy } from "../explorer/hotspots";

export type HotspotsQuery = {
  from: string;
  to: string;
  sources: string[];
  types: string[];
  tags: string[];
  fav: boolean;
  rank: PlaceRankBy;
  lat: number | null;
  lon: number | null;
};

export type DayTripsQuery = {
  year: string;
  modes: string[];
  min: number;
  q: string;
};

const DEFAULT_MIN = 5;

function csv(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 40);
}

function setCsv(sp: URLSearchParams, key: string, values: string[]) {
  if (values.length) sp.set(key, values.join(","));
  else sp.delete(key);
}

export function parseHotspotsQuery(sp: URLSearchParams): HotspotsQuery {
  const rankRaw = sp.get("rank");
  const rank: PlaceRankBy = rankRaw === "duration" || rankRaw === "dwell" ? "dwell" : "visits";
  const lat = Number(sp.get("lat"));
  const lon = Number(sp.get("lon"));
  return {
    from: sp.get("from") ?? "",
    to: sp.get("to") ?? "",
    sources: csv(sp.get("sources")),
    types: csv(sp.get("types")),
    tags: csv(sp.get("tags")),
    fav: sp.get("fav") === "1",
    rank,
    lat: Number.isFinite(lat) && Math.abs(lat) <= 90 ? lat : null,
    lon: Number.isFinite(lon) && Math.abs(lon) <= 180 ? lon : null,
  };
}

export function serializeHotspotsQuery(q: HotspotsQuery): URLSearchParams {
  const sp = new URLSearchParams();
  if (q.from) sp.set("from", q.from);
  if (q.to) sp.set("to", q.to);
  setCsv(sp, "sources", q.sources);
  setCsv(sp, "types", q.types);
  setCsv(sp, "tags", q.tags);
  if (q.fav) sp.set("fav", "1");
  if (q.rank === "dwell") sp.set("rank", "duration");
  if (q.lat != null && q.lon != null) {
    sp.set("lat", String(q.lat));
    sp.set("lon", String(q.lon));
  }
  return sp;
}

export function parseDayTripsQuery(sp: URLSearchParams): DayTripsQuery {
  const minRaw = Number(sp.get("min"));
  return {
    year: sp.get("year") && sp.get("year") !== "all" ? sp.get("year")! : "all",
    modes: csv(sp.get("mode")),
    min: Number.isFinite(minRaw) && minRaw >= 0 ? minRaw : DEFAULT_MIN,
    q: sp.get("q") ?? "",
  };
}

export function serializeDayTripsQuery(q: DayTripsQuery): URLSearchParams {
  const sp = new URLSearchParams();
  if (q.year && q.year !== "all") sp.set("year", q.year);
  setCsv(sp, "mode", q.modes);
  if (q.min !== DEFAULT_MIN) sp.set("min", String(q.min));
  if (q.q.trim()) sp.set("q", q.q.trim());
  return sp;
}

export function parseCoverageRange(sp: URLSearchParams): { from?: string; to?: string } {
  const from = sp.get("from") || undefined;
  const to = sp.get("to") || undefined;
  return { from, to };
}

export function gpsHotspotsPath(lat: number, lon: number, currentSearch = ""): string {
  const sp = new URLSearchParams(currentSearch.startsWith("?") ? currentSearch.slice(1) : currentSearch);
  sp.set("lat", String(lat));
  sp.set("lon", String(lon));
  const qs = sp.toString();
  return qs ? `/hotspots?${qs}` : `/hotspots?lat=${lat}&lon=${lon}`;
}

export function hasSavableFilters(pathname: string, search: string): boolean {
  if (pathname !== "/hotspots" && pathname !== "/trips") return false;
  const sp = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (pathname === "/hotspots") {
    const q = parseHotspotsQuery(sp);
    return Boolean(q.from || q.to || q.sources.length || q.types.length || q.tags.length || q.fav || q.rank === "dwell");
  }
  const q = parseDayTripsQuery(sp);
  return Boolean(q.year !== "all" || q.modes.length || q.min !== DEFAULT_MIN || q.q.trim());
}
