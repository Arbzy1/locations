import type { FunFact, MultiDayTrip } from '../../types';
import { formatDuration, formatMilesOrKm, type DistanceUnit } from '../../utils/format';
import { preferenceStorage } from '../preference-storage';

const GRID_CLUSTER = /^\d+\.\d+°[NS] \d+\.\d+°[EW]$/;
const TRIP_NOTES_KEY = 'locations-trip-notes';

export function isGridCluster(name: string): boolean {
  return GRID_CLUSTER.test(name);
}

export function multiDayTripLabel(
  trip: Pick<MultiDayTrip, 'name' | 'clusters'>,
  hiddenKeys: Set<string>,
): string | null {
  const custom = trip.name?.trim();
  if (custom) return custom;
  const visible = trip.clusters.filter(
    (c) => c && !hiddenKeys.has(c) && !isGridCluster(c),
  );
  if (!visible.length) return null;
  const start = visible[0];
  const end = visible[visible.length - 1];
  if (start === end) return start;
  return `${start} to ${end}`;
}

export function enrichMultiDayTripsWithSaved(
  trips: MultiDayTrip[] | undefined,
  saved: { id: string; name: string; start: string; end: string; dates?: string[] }[] | undefined,
): MultiDayTrip[] {
  const base = Array.isArray(trips) ? trips : [];
  const named = Array.isArray(saved) ? saved : [];
  if (!named.length) return base;
  const byRange = new Map<string, (typeof named)[number]>();
  for (const n of named) {
    byRange.set(`${n.start}|${n.end}`, n);
  }
  const used = new Set<string>();
  const enriched = base.map((t) => {
    const key = `${t.start}|${t.end}`;
    const exact = byRange.get(key);
    if (exact) {
      used.add(exact.id);
      return { ...t, name: exact.name };
    }
    const overlap = named.find((n) => n.start <= t.end && n.end >= t.start);
    if (overlap) {
      used.add(overlap.id);
      return { ...t, name: overlap.name };
    }
    return t;
  });
  for (const n of named) {
    if (used.has(n.id)) continue;
    enriched.push({
      start: n.start,
      end: n.end,
      dates: n.dates?.length ? n.dates : [n.start, n.end],
      total_miles: 0,
      clusters: [],
      name: n.name,
    });
  }
  return enriched;
}

export function loadTripNotes(): Record<string, string> {
  try {
    const raw = preferenceStorage.getItem(TRIP_NOTES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveTripNote(tripId: string, note: string): Record<string, string> {
  const next = { ...loadTripNotes() };
  const trimmed = note.trim().slice(0, 500);
  if (trimmed) next[tripId] = trimmed;
  else delete next[tripId];
  preferenceStorage.setItem(TRIP_NOTES_KEY, JSON.stringify(next));
  return next;
}

export function formatFunFact(
  fact: FunFact,
  unit: DistanceUnit,
): { value: string; description: string } {
  if (fact.minutes != null) {
    return {
      value: fact.value,
      description: [formatDuration(fact.minutes), fact.description].filter(Boolean).join(' · '),
    };
  }
  if (fact.label === 'Farthest from Home' && fact.miles != null) {
    const dist = formatMilesOrKm(fact.miles, unit);
    return {
      value: fact.value,
      description: fact.description ? `${dist} · ${fact.description}` : dist,
    };
  }
  if (fact.miles != null) {
    return {
      value: formatMilesOrKm(fact.miles, unit),
      description: fact.date || fact.description,
    };
  }
  return { value: fact.value, description: fact.description };
}
