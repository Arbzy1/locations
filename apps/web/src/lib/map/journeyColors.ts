import { useSyncExternalStore } from 'react';
import { getJourneyColor } from './mapPopups';

/**
 * How Day View colours journey lines: by transport mode (default, the same colours
 * every day and in the timeline chips) or by journey (a gradient through the day).
 */
export type JourneyColoring = 'mode' | 'journey';

const STORAGE_KEY = 'locations-journey-colour';
const CHANGE_EVENT = 'locations-journey-colour';

/** Theme token per transport mode (defined for both themes in index.css). */
export function modeColorVar(mode: string): string {
  const known = ['walking', 'cycling', 'car', 'bus', 'train', 'subway', 'flying'];
  return `var(--mode-${known.includes(mode) ? mode : 'unknown'})`;
}

/** A literal colour for canvas, MapLibre paint or SVG attributes, resolving `var(--token)`. */
export function resolveCssColor(value: string, fallback = '#58a6ff'): string {
  const token = /^var\((--[\w-]+)\)$/.exec(value.trim());
  if (!token || typeof document === 'undefined') return value;
  return getComputedStyle(document.documentElement).getPropertyValue(token[1]).trim() || fallback;
}

/**
 * Colour of one journey. By journey, a source colour (two people's data) wins, as before;
 * by mode, the mode colour does.
 */
export function journeyColor(
  a: { mode: string; source_id?: string | null },
  index: number,
  total: number,
  coloring: JourneyColoring,
  sourceColors?: Record<string, string>,
): string {
  if (coloring === 'mode') return modeColorVar(a.mode);
  return (a.source_id && sourceColors?.[a.source_id]) || getJourneyColor(index, total);
}

/** Used when browser storage is blocked (private mode): the choice lasts until reload. */
let memoryColoring: JourneyColoring = 'mode';

function readColoring(): JourneyColoring {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'journey' || stored === 'mode' ? stored : memoryColoring;
  } catch {
    return memoryColoring;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function setJourneyColoring(next: JourneyColoring) {
  memoryColoring = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Storage blocked: memoryColoring holds it.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** The viewer's "Colour lines by" choice, shared by the map, its legends and the timeline. */
export function useJourneyColoring(): [JourneyColoring, (next: JourneyColoring) => void] {
  const value = useSyncExternalStore(subscribe, readColoring, () => 'mode' as const);
  return [value, setJourneyColoring];
}
