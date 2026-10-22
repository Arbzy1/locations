import { haversineM, journeyTrace, type PathPoint } from "@locations/db";

/** Rows an export needs; selected by `/api/export/:format`. */
export type ExportVisit = {
  start: string;
  end: string;
  date: string;
  lat: number;
  lon: number;
  durationMinutes: number;
  semanticType: string;
  placeKey: string | null;
  cluster: string;
};

export type ExportJourney = {
  start: string;
  end: string;
  date: string;
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
  mode: string;
  distanceMeters: number;
  path: PathPoint[] | null;
};

export const EXPORT_FORMATS = ["gpx", "geojson", "csv"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** Around home, fixes are dropped and stays snapped to this grid (about 1 km). */
export const HOME_BLUR_RADIUS_M = 500;
const BLUR_DECIMALS = 2;

/**
 * Home for blurring: the place with the most time in stays that start in the evening or
 * at night. Exports are shared with other apps, so this errs towards blurring.
 */
export function guessHomePlace(visits: ExportVisit[]): { lat: number; lon: number } | null {
  const minutes = new Map<string, { total: number; lat: number; lon: number }>();
  for (const v of visits) {
    const hour = new Date(v.start).getUTCHours();
    if (!(hour >= 20 || hour < 6)) continue;
    const key = v.placeKey ?? `${v.lat.toFixed(3)},${v.lon.toFixed(3)}`;
    const row = minutes.get(key) ?? { total: 0, lat: v.lat, lon: v.lon };
    row.total += v.durationMinutes;
    minutes.set(key, row);
  }
  let best: { total: number; lat: number; lon: number } | null = null;
  for (const row of minutes.values()) if (!best || row.total > best.total) best = row;
  return best ? { lat: best.lat, lon: best.lon } : null;
}

const blur = (n: number) => Number(n.toFixed(BLUR_DECIMALS));

function nearHome(home: { lat: number; lon: number } | null, lat: number, lon: number) {
  return Boolean(home) && haversineM(home!.lat, home!.lon, lat, lon) <= HOME_BLUR_RADIUS_M;
}

/** Hide the home position: snap stays and journey ends near it, drop GPS fixes near it. */
export function blurHome(
  data: { visits: ExportVisit[]; journeys: ExportJourney[] },
  home: { lat: number; lon: number } | null,
) {
  if (!home) return data;
  const visits = data.visits.map((v) =>
    nearHome(home, v.lat, v.lon) ? { ...v, lat: blur(v.lat), lon: blur(v.lon), placeKey: null } : v,
  );
  const journeys = data.journeys.map((j) => {
    const startNear = nearHome(home, j.startLat, j.startLon);
    const endNear = nearHome(home, j.endLat, j.endLon);
    return {
      ...j,
      startLat: startNear ? blur(j.startLat) : j.startLat,
      startLon: startNear ? blur(j.startLon) : j.startLon,
      endLat: endNear ? blur(j.endLat) : j.endLat,
      endLon: endNear ? blur(j.endLon) : j.endLon,
      path: j.path ? j.path.filter(([lat, lon]) => !nearHome(home, lat, lon)) : null,
    };
  });
  return { visits, journeys };
}

/** A journey as [lat, lon, unixSeconds | null]: its GPS trace, else start to end. */
function journeyLine(j: ExportJourney): [number, number, number | null][] {
  const trace = journeyTrace(j);
  if (trace && trace.length >= 2) return trace.map(([lat, lon, s]) => [lat, lon, s]);
  return [
    [j.startLat, j.startLon, Math.round(Date.parse(j.start) / 1000) || null],
    [j.endLat, j.endLon, Math.round(Date.parse(j.end) / 1000) || null],
  ];
}

const xml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** GPX 1.1: a waypoint per stay, a track per journey (GPS fixes keep their times). */
export function toGpx(data: { visits: ExportVisit[]; journeys: ExportJourney[] }): string {
  const out: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Locations" xmlns="http://www.topografix.com/GPX/1/1">',
  ];
  for (const v of data.visits) {
    out.push(
      `  <wpt lat="${v.lat}" lon="${v.lon}"><time>${xml(v.start)}</time><name>${xml(
        v.semanticType === "Unknown" ? "Stay" : v.semanticType,
      )}</name><desc>${Math.round(v.durationMinutes)} min</desc></wpt>`,
    );
  }
  for (const j of data.journeys) {
    out.push(`  <trk><name>${xml(`${j.date} ${j.mode}`)}</name><type>${xml(j.mode)}</type><trkseg>`);
    for (const [lat, lon, s] of journeyLine(j)) {
      out.push(
        `    <trkpt lat="${lat}" lon="${lon}">${s ? `<time>${new Date(s * 1000).toISOString()}</time>` : ""}</trkpt>`,
      );
    }
    out.push("  </trkseg></trk>");
  }
  out.push("</gpx>");
  return out.join("\n");
}

/** GeoJSON FeatureCollection: Points for stays, LineStrings for journeys ([lon, lat] order). */
export function toGeoJson(data: { visits: ExportVisit[]; journeys: ExportJourney[] }) {
  return {
    type: "FeatureCollection",
    features: [
      ...data.visits.map((v) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [v.lon, v.lat] },
        properties: {
          kind: "stay",
          start: v.start,
          end: v.end,
          duration_minutes: Math.round(v.durationMinutes),
          semantic_type: v.semanticType,
          place_key: v.placeKey,
        },
      })),
      ...data.journeys.map((j) => ({
        type: "Feature",
        geometry: { type: "LineString", coordinates: journeyLine(j).map(([lat, lon]) => [lon, lat]) },
        properties: {
          kind: "journey",
          start: j.start,
          end: j.end,
          mode: j.mode,
          distance_m: Math.round(j.distanceMeters),
          recorded: Boolean(j.path?.length),
        },
      })),
    ],
  };
}

/** One CSV cell: quoted when needed, and never starting like a spreadsheet formula. */
function csvCell(value: string | number | null): string {
  if (value === null) return "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s) && typeof value === "string") s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Stays as CSV, one row each. */
export function toVisitsCsv(visits: ExportVisit[]): string {
  const header = ["date", "start", "end", "duration_minutes", "lat", "lon", "semantic_type", "place_key", "region"];
  const rows = visits.map((v) =>
    [v.date, v.start, v.end, Math.round(v.durationMinutes), v.lat, v.lon, v.semanticType, v.placeKey, v.cluster]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...rows].join("\r\n") + "\r\n";
}
