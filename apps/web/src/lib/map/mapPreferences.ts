import { preferenceStorage } from '../preference-storage';
import type { BasemapId } from './mapStyle';

const BASEMAP_KEY = 'locations-map-basemap';
const BUILDINGS_KEY = 'locations-map-3d';
const HEAT_ON_KEY = 'locations-map-heat-on';
const HEAT_OPACITY_KEY = 'locations-map-heat-opacity';
const HEAT_INTENSITY_KEY = 'locations-map-heat-intensity';

export type MapPreferences = {
  basemap: BasemapId;
  buildings3d: boolean;
  heatmapOn: boolean;
  opacityPct: number;
  intensityPct: number;
};

const VALID_BASEMAPS: readonly BasemapId[] = ['auto', 'street', 'satellite'];

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  if (raw == null) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function loadMapPreferences(): MapPreferences {
  const rawBasemap = preferenceStorage.getItem(BASEMAP_KEY);
  const basemap: BasemapId =
    rawBasemap && (VALID_BASEMAPS as readonly string[]).includes(rawBasemap)
      ? (rawBasemap as BasemapId)
      : 'auto';
  const buildings3d = preferenceStorage.getItem(BUILDINGS_KEY) === 'true';
  const heatmapOn = preferenceStorage.getItem(HEAT_ON_KEY) !== 'false';
  const opacityPct = clampInt(preferenceStorage.getItem(HEAT_OPACITY_KEY), 72, 12, 100);
  const intensityPct = clampInt(preferenceStorage.getItem(HEAT_INTENSITY_KEY), 100, 40, 180);
  return { basemap, buildings3d, heatmapOn, opacityPct, intensityPct };
}

export function saveMapPreferences(prefs: Partial<MapPreferences>): void {
  if (prefs.basemap !== undefined) preferenceStorage.setItem(BASEMAP_KEY, prefs.basemap);
  if (prefs.buildings3d !== undefined) preferenceStorage.setItem(BUILDINGS_KEY, String(prefs.buildings3d));
  if (prefs.heatmapOn !== undefined) preferenceStorage.setItem(HEAT_ON_KEY, String(prefs.heatmapOn));
  if (prefs.opacityPct !== undefined) preferenceStorage.setItem(HEAT_OPACITY_KEY, String(prefs.opacityPct));
  if (prefs.intensityPct !== undefined) preferenceStorage.setItem(HEAT_INTENSITY_KEY, String(prefs.intensityPct));
}
