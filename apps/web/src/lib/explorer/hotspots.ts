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
  cluster?: string;
  label?: string;
  lat: number;
  lon: number;
  count: number;
  totalDurationMinutes?: number;
  topTypes?: string[];
};

export function placeKeys(p: RankablePlace): string[] {
  const keys = [p.cluster, p.label, `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`];
  return keys.filter((k): k is string => Boolean(k && k.trim()));
}

export function placeMatchesTypes(topTypes: string[] | undefined, selected: string[]): boolean {
  if (!selected.length) return true;
  const have = new Set((topTypes ?? []).map((t) => t.toLowerCase()));
  return selected.some((t) => have.has(t.toLowerCase()));
}

export function placeMetric(p: RankablePlace, rankBy: PlaceRankBy): number {
  return rankBy === 'dwell' ? (p.totalDurationMinutes ?? 0) : p.count;
}

export function findPlaceLabel(p: RankablePlace, labels: PlaceLabelMeta[]): PlaceLabelMeta | undefined {
  const keys = new Set(placeKeys(p));
  return labels.find((l) => keys.has(l.placeKey));
}

/**
 * `findPlaceLabel` for many points: index the labels once instead of scanning them
 * per point. Same answer (the earliest matching label in `labels` order wins).
 */
export function placeLabelLookup(labels: PlaceLabelMeta[]): (p: RankablePlace) => PlaceLabelMeta | undefined {
  const byKey = new Map<string, number>();
  labels.forEach((l, i) => {
    if (!byKey.has(l.placeKey)) byKey.set(l.placeKey, i);
  });
  return (p) => {
    let best: number | undefined;
    for (const key of placeKeys(p)) {
      const i = byKey.get(key);
      if (i !== undefined && (best === undefined || i < best)) best = i;
    }
    return best === undefined ? undefined : labels[best];
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
