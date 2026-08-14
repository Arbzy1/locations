import type { FunFact, MultiDayTrip } from '../types';
import { formatDuration, formatMilesOrKm, type DistanceUnit } from '../utils/format';

const GRID_CLUSTER = /^\d+\.\d+°[NS] \d+\.\d+°[EW]$/;

export function isGridCluster(name: string): boolean {
  return GRID_CLUSTER.test(name);
}

export function multiDayTripLabel(
  trip: Pick<MultiDayTrip, 'name' | 'clusters'>,
  hiddenKeys: Set<string>,
): string | null {
  const visible = trip.clusters.filter(
    (c) => c && !hiddenKeys.has(c) && !isGridCluster(c),
  );
  if (!visible.length) return null;
  const start = visible[0];
  const end = visible[visible.length - 1];
  if (start === end) return start;
  return `${start} to ${end}`;
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
