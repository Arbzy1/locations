/** Which view the Map tab opens: the heatmap or every journey line. */
export type MapMode = 'heat' | 'lines';

const KEY = 'locations-map-mode';

export function loadMapMode(): MapMode {
  try {
    return window.localStorage.getItem(KEY) === 'lines' ? 'lines' : 'heat';
  } catch {
    return 'heat';
  }
}

export function saveMapMode(mode: MapMode) {
  try {
    window.localStorage.setItem(KEY, mode);
  } catch {
    /* private mode or blocked storage: the Map tab just opens the heatmap */
  }
}

export function mapModePath(mode: MapMode) {
  return mode === 'lines' ? '/routes' : '/hotspots';
}
