/**
 * Tenant aggregates (day_stats rows and analytics_cache entries) computed from stays and
 * journeys. Pure, so the browser can compute them for large timelines and the CLI and
 * tests can reuse the exact same code.
 */
import { buildStore, computeAllAnalytics } from "./analytics.js";
import { METERS_TO_MILES } from "./geo.js";
import type { ActivityRow, DayStatsRow, TenantId, VisitRow } from "./schema.js";

export function buildDayStatRows(
  tenant: TenantId,
  visitRows: Array<{ date: string; cluster: string }>,
  activityRows: Array<{ date: string; mode: string; distanceMeters: number }>,
) {
  const dayMap = new Map<
    string,
    {
      visits: Array<{ date: string; cluster: string }>;
      activities: Array<{ date: string; mode: string; distanceMeters: number }>;
    }
  >();
  for (const v of visitRows) {
    if (!dayMap.has(v.date)) dayMap.set(v.date, { visits: [], activities: [] });
    dayMap.get(v.date)!.visits.push(v);
  }
  for (const a of activityRows) {
    if (!dayMap.has(a.date)) dayMap.set(a.date, { visits: [], activities: [] });
    dayMap.get(a.date)!.activities.push(a);
  }

  const dayStatRows: DayStatsRow[] = [];
  for (const [date, day] of [...dayMap.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const totalDist =
      day.activities.reduce((s, a) => s + a.distanceMeters, 0) * METERS_TO_MILES;
    const modes: Record<string, number> = {};
    for (const a of day.activities) modes[a.mode] = (modes[a.mode] ?? 0) + 1;
    const clusters: string[] = [];
    for (const v of day.visits) {
      if (!clusters.includes(v.cluster)) clusters.push(v.cluster);
    }
    dayStatRows.push({
      tenant,
      date,
      totalDistanceMiles: Math.round(totalDist * 10) / 10,
      modes,
      clusters,
      visitCount: day.visits.length,
      activityCount: day.activities.length,
    });
  }
  return dayStatRows;
}

/** Everything a tenant rebuild writes: one row per day and one entry per analytics key. */
export function computeTenantAggregates(
  tenant: TenantId,
  visitRows: VisitRow[],
  activityRows: ActivityRow[],
  timezone?: string | null,
): { dayStats: DayStatsRow[]; analytics: Record<string, unknown> } {
  const dayStats = buildDayStatRows(tenant, visitRows, activityRows);
  const store = buildStore(visitRows, activityRows, dayStats);
  const all = computeAllAnalytics(store, { timezone });
  // Nothing to show (e.g. no commute when home and work share a region) is left out:
  // analytics_cache.data is NOT NULL and reads treat a missing key as empty.
  const analytics: Record<string, unknown> = {};
  for (const [key, data] of Object.entries(all)) {
    if (data !== null && data !== undefined) analytics[key] = data;
  }
  return { dayStats, analytics };
}
