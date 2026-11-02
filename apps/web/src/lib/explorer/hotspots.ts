export const PLACE_COLOR_TOKENS = [
  'accent',
  'visit',
  'walk',
  'train',
  'car',
  'bus',
  'cycle',
] as const;

export type PlaceColorToken = (typeof PLACE_COLOR_TOKENS)[number];

export type PlaceRankBy = 'visits' | 'dwell';

export function isPlaceColorToken(value: string | null | undefined): value is PlaceColorToken {
  return Boolean(value && (PLACE_COLOR_TOKENS as readonly string[]).includes(value));
}

export function sourceTokenVar(color: string | null | undefined): string {
  return isPlaceColorToken(color) ? `var(--${color})` : 'var(--accent)';
}

export type PlaceLabelMeta = {
  placeKey: string;
  label: string;
  hidden: boolean;
  favourite?: boolean;
  color?: string | null;
  tags?: string[];
};

export type RankablePlace = {
  placeKey?: string | null;
  cluster?: string;
  label?: string;
  lat: number;
  lon: number;
  count: number;
  totalDurationMinutes?: number;
  topTypes?: string[];
};

export function placeKeys(p: RankablePlace): string[] {
  // Most specific first: the hotspot's real place, its exact spot, then the older grid
  // cluster and label keys that names were saved under before hotspots had place keys.
  const keys = [p.placeKey ?? undefined, `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`, p.cluster, p.label];
  return keys.filter((k): k is string => Boolean(k && k.trim()));
}

/**
 * Second line under a hotspot's title: the street (when the title is Home, Work or your
 * own name) and the town, skipping whatever the title already says.
 */
export function hotspotSubtitle(p: { label: string; street?: string | null; settlement?: string | null }): string {
  const title = p.label.toLowerCase();
  const parts = [p.street, p.settlement].filter(
    (part): part is string => Boolean(part && !title.includes(part.toLowerCase())),
  );
  return [...new Set(parts)].join(' · ');
}

export function placeMatchesTypes(topTypes: string[] | undefined, selected: string[]): boolean {
  if (!selected.length) return true;
  const have = new Set((topTypes ?? []).map((t) => t.toLowerCase()));
  return selected.some((t) => have.has(t.toLowerCase()));
}

export function placeMetric(p: RankablePlace, rankBy: PlaceRankBy): number {
  return rankBy === 'dwell' ? (p.totalDurationMinutes ?? 0) : p.count;
}

/**
 * The saved name for a place, trying its keys in order: the hotspot's own place first,
 * then the older grid-cluster and label keys. For one key saved twice, the first wins.
 */
export function findPlaceLabel(p: RankablePlace, labels: PlaceLabelMeta[]): PlaceLabelMeta | undefined {
  return placeLabelLookup(labels)(p);
}

/** `findPlaceLabel` for many points: index the labels once instead of scanning them per point. */
export function placeLabelLookup(labels: PlaceLabelMeta[]): (p: RankablePlace) => PlaceLabelMeta | undefined {
  const byKey = new Map<string, PlaceLabelMeta>();
  for (const l of labels) if (!byKey.has(l.placeKey)) byKey.set(l.placeKey, l);
  return (p) => {
    for (const key of placeKeys(p)) {
      const hit = byKey.get(key);
      if (hit) return hit;
    }
    return undefined;
  };
}

export function uniqueTopTypes(points: RankablePlace[], cap = 12): string[] {
  const counts = new Map<string, number>();
  for (const p of points) {
    for (const t of p.topTypes ?? []) {
      if (!t || t.toLowerCase() === 'unknown') continue;
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, cap)
    .map(([name]) => name);
}

export function uniqueLabelTags(labels: PlaceLabelMeta[], cap = 12): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of labels) {
    if (l.hidden) continue;
    for (const tag of l.tags ?? []) {
      const key = tag.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(tag);
      if (out.length >= cap) return out;
    }
  }
  return out;
}

export function filterAndRankPlaces<T extends RankablePlace>(
  points: T[],
  opts: {
    types: string[];
    tags: string[];
    favouritesOnly: boolean;
    rankBy: PlaceRankBy;
    labels: PlaceLabelMeta[];
    limit?: number;
  },
): T[] {
  const selectedTags = new Set(opts.tags.map((t) => t.toLowerCase()));
  const labelFor = placeLabelLookup(opts.labels);
  // Resolve each point's label once; the sort comparator then reads a flag.
  const ranked = points
    .filter((p) => placeMatchesTypes(p.topTypes, opts.types))
    .map((p) => ({ p, meta: labelFor(p) }))
    .filter(({ meta }) => {
      if (opts.favouritesOnly && !meta?.favourite) return false;
      if (!selectedTags.size) return true;
      const tags = (meta?.tags ?? []).map((t) => t.toLowerCase());
      return tags.some((t) => selectedTags.has(t));
    })
    .map(({ p, meta }) => ({ p, fav: meta?.favourite ? 1 : 0, metric: placeMetric(p, opts.rankBy) }))
    .sort((a, b) => (a.fav !== b.fav ? b.fav - a.fav : b.metric - a.metric))
    .map(({ p }) => p);
  return opts.limit ? ranked.slice(0, opts.limit) : ranked;
}

export function toggleChip(selected: string[], value: string): string[] {
  return selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value];
}
