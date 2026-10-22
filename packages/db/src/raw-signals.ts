import { haversineM } from "./geo.js";
import type { PathPoint } from "./schema.js";
import type { RawTimelineRecord } from "./timeline-import.js";

/** Fixes within this distance of a stay's centre belong to it. */
const STAY_RADIUS_M = 200;
/** Time at one spot before it counts as a stay. */
const MIN_STAY_S = 10 * 60;
/** Movements shorter than this between stays are GPS jitter, not journeys. */
const MIN_MOVE_M = 300;
/** Fixes with a reported accuracy worse than this are ignored. */
export const MAX_FIX_ACCURACY_M = 200;

const iso = (s: number) => new Date(s * 1000).toISOString();
const geo = (lat: number, lon: number) => `geo:${lat},${lon}`;

type Stay = { startS: number; endS: number; lat: number; lon: number; first: number; last: number };

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Google's raw-signal mode names, guessed from average speed. */
function modeForSpeed(kmh: number): string {
  if (kmh < 7) return "walking";
  if (kmh < 160) return "in passenger vehicle";
  return "flying";
}

/** A GPS path as a timelinePath record, so it attaches to journeys like any other path. */
export function pathRecord(fixes: PathPoint[]): RawTimelineRecord | null {
  if (!fixes.length) return null;
  return {
    startTime: iso(fixes[0][2]),
    endTime: iso(fixes[fixes.length - 1][2]),
    timelinePath: fixes.map(([lat, lon, s]) => ({ point: geo(lat, lon), time: iso(s) })),
  };
}

/**
 * Turn raw location fixes (Records.json, Timeline Edits raw signals) into stays and
 * journeys: 10+ minutes within ~200 m is a stay at the median position; the fixes
 * between two stays are a journey with that GPS path.
 */
export function detectStaysAndMoves(input: PathPoint[]): RawTimelineRecord[] {
  const fixes = [...input].sort((a, b) => a[2] - b[2]);
  const stays: Stay[] = [];

  let i = 0;
  while (i < fixes.length) {
    let latSum = fixes[i][0];
    let lonSum = fixes[i][1];
    let j = i + 1;
    while (j < fixes.length) {
      const n = j - i;
      if (haversineM(latSum / n, lonSum / n, fixes[j][0], fixes[j][1]) > STAY_RADIUS_M) break;
      latSum += fixes[j][0];
      lonSum += fixes[j][1];
      j++;
    }
    const last = j - 1;
    if (fixes[last][2] - fixes[i][2] >= MIN_STAY_S) {
      const window = fixes.slice(i, j);
      const stay: Stay = {
        startS: fixes[i][2],
        endS: fixes[last][2],
        lat: median(window.map((f) => f[0])),
        lon: median(window.map((f) => f[1])),
        first: i,
        last,
      };
      const prev = stays.at(-1);
      // Back at the same spot after a short wander (or a GPS blip): one stay.
      if (prev && haversineM(prev.lat, prev.lon, stay.lat, stay.lon) <= STAY_RADIUS_M) {
        prev.endS = stay.endS;
        prev.last = stay.last;
      } else {
        stays.push(stay);
      }
      i = j;
    } else {
      i++;
    }
  }

  const records: RawTimelineRecord[] = [];
  stays.forEach((stay, k) => {
    records.push({
      startTime: iso(stay.startS),
      endTime: iso(stay.endS),
      visit: { topCandidate: { placeLocation: geo(stay.lat, stay.lon), semanticType: "Unknown" } },
    });
    const next = stays[k + 1];
    if (!next) return;
    const path = fixes.slice(stay.last, next.first + 1);
    let meters = 0;
    for (let p = 1; p < path.length; p++) {
      meters += haversineM(path[p - 1][0], path[p - 1][1], path[p][0], path[p][1]);
    }
    if (meters < MIN_MOVE_M || next.startS <= stay.endS) return;
    const hours = (next.startS - stay.endS) / 3600;
    records.push({
      startTime: iso(stay.endS),
      endTime: iso(next.startS),
      activity: {
        start: geo(stay.lat, stay.lon),
        end: geo(next.lat, next.lon),
        distanceMeters: Math.round(meters),
        topCandidate: { type: modeForSpeed(meters / 1000 / Math.max(hours, 1 / 60)) },
      },
    });
    const pathRec = pathRecord(path);
    if (pathRec) records.push(pathRec);
  });
  return records;
}
