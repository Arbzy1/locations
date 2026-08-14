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
  const ranked = points
    .filter((p) => placeMatchesTypes(p.topTypes, opts.types))
    .filter((p) => {
      const meta = findPlaceLabel(p, opts.labels);
      if (opts.favouritesOnly && !meta?.favourite) return false;
      if (!selectedTags.size) return true;
      const tags = (meta?.tags ?? []).map((t) => t.toLowerCase());
      return tags.some((t) => selectedTags.has(t));
    })
    .sort((a, b) => {
      const fa = findPlaceLabel(a, opts.labels)?.favourite ? 1 : 0;
      const fb = findPlaceLabel(b, opts.labels)?.favourite ? 1 : 0;
      if (fa !== fb) return fb - fa;
      return placeMetric(b, opts.rankBy) - placeMetric(a, opts.rankBy);
    });
  return opts.limit ? ranked.slice(0, opts.limit) : ranked;
}

export function toggleChip(selected: string[], value: string): string[] {
  return selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value];
}
