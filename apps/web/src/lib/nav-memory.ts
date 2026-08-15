export const RECENT_PLACES_KEY = "locations-recent-places";
export const FILTER_PRESETS_KEY = "locations-filter-presets";

export type RecentPlace = { cluster: string; label: string; at: number };
export type FilterPreset = { name: string; path: string };

const MAX_RECENTS = 8;
const MAX_PRESETS = 8;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadRecentPlaces(): RecentPlace[] {
  const rows = readJson<unknown>(RECENT_PLACES_KEY, []);
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r): r is RecentPlace => {
      if (!r || typeof r !== "object") return false;
      const row = r as RecentPlace;
      return typeof row.cluster === "string" && typeof row.label === "string" && typeof row.at === "number";
    })
    .slice(0, MAX_RECENTS);
}

export function rememberRecentPlace(cluster: string, label: string): void {
  const key = cluster.trim().slice(0, 200);
  if (!key) return;
  const next: RecentPlace[] = [
    { cluster: key, label: (label || key).slice(0, 200), at: Date.now() },
    ...loadRecentPlaces().filter((r) => r.cluster !== key),
  ].slice(0, MAX_RECENTS);
  localStorage.setItem(RECENT_PLACES_KEY, JSON.stringify(next));
}

export function loadFilterPresets(): FilterPreset[] {
  const rows = readJson<unknown>(FILTER_PRESETS_KEY, []);
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r): r is FilterPreset => {
      if (!r || typeof r !== "object") return false;
      const row = r as FilterPreset;
      return typeof row.name === "string" && typeof row.path === "string" && row.path.startsWith("/");
    })
    .slice(0, MAX_PRESETS);
}

export function saveFilterPreset(name: string, path: string): FilterPreset[] {
  const trimmed = name.trim().slice(0, 40);
  if (!trimmed || !path.startsWith("/")) return loadFilterPresets();
  const next = [
    { name: trimmed, path },
    ...loadFilterPresets().filter((p) => p.name !== trimmed),
  ].slice(0, MAX_PRESETS);
  localStorage.setItem(FILTER_PRESETS_KEY, JSON.stringify(next));
  return next;
}

export function deleteFilterPreset(name: string): FilterPreset[] {
  const next = loadFilterPresets().filter((p) => p.name !== name);
  localStorage.setItem(FILTER_PRESETS_KEY, JSON.stringify(next));
  return next;
}
