import { randomUUID } from "node:crypto";
import { and, eq, getTableColumns, gte, isNull, lte, ne, or, sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import * as schema from "./schema.js";
import {
  activities,
  analyticsCache,
  dataSources,
  dayStats,
  userSettings,
  visits,
  type TenantId,
} from "./schema.js";
import {
  buildStore,
  computeAwayNights,
  computeCommute,
  computeHourOfWeek,
  computeMovingHistory,
  inferHomeWork,
} from "./analytics.js";

type Db = NeonHttpDatabase<typeof schema> | NeonDatabase<typeof schema>;

const BATCH = 500;

export * from "./timeline-parse.js";
export { buildDayStatRows, computeTenantAggregates } from "./aggregates.js";
import { namedTripsFromMemories, parseTimelineJson } from "./timeline-parse.js";
import { computeTenantAggregates } from "./aggregates.js";

/** Rebuild day_stats + analytics_cache for a tenant from all sources. */
/**
 * How a data change updates day_stats and analytics_cache. "rebuild" recomputes them
 * here (CLI, tests). "mark-stale" only flags them: the Worker free plan cannot afford
 * the CPU for a large timeline, so the signed-in browser recomputes and uploads them.
 */
export type AggregateMode = "rebuild" | "mark-stale";

/** analytics_cache key that flags a tenant's aggregates as out of date. */
export const AGGREGATES_STALE_KEY = "_aggregates_stale";

export async function markAggregatesStale(db: Db, tenant: TenantId): Promise<void> {
  const data = { since: new Date().toISOString() };
  await db
    .insert(analyticsCache)
    .values({ tenant, key: AGGREGATES_STALE_KEY, data })
    .onConflictDoUpdate({
      target: [analyticsCache.tenant, analyticsCache.key],
      set: { data, updatedAt: new Date() },
    });
}

/** Days that still have data, for callers that no longer rebuild day_stats inline. */
async function countDaysWithData(db: Db, tenant: TenantId): Promise<number> {
  const [row] = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from (select date from visits where tenant = ${tenant} union select date from activities where tenant = ${tenant}) d`,
  ).then((r) => ("rows" in r ? (r.rows as { n: number }[]) : (r as unknown as { n: number }[])));
  return Number(row?.n ?? 0);
}

/** Apply the chosen aggregate mode after rows changed. */
async function afterDataChange(db: Db, tenant: TenantId, mode: AggregateMode): Promise<{ days: number }> {
  if (mode === "rebuild") return rebuildTenantAggregates(db, tenant);
  await markAggregatesStale(db, tenant);
  return { days: await countDaysWithData(db, tenant) };
}

export async function rebuildTenantAggregates(
  db: Db,
  tenant: TenantId,
): Promise<{ days: number }> {
  const visitSelect = await db.select().from(visits).where(eq(visits.tenant, tenant));
  // GPS paths are most of the table's bytes and no aggregate reads them.
  const { path: _path, ...activityColumns } = getTableColumns(activities);
  const activitySelect = (
    await db.select(activityColumns).from(activities).where(eq(activities.tenant, tenant))
  ).map((row) => ({ ...row, path: null }));
  const settingsRows = await db
    .select({ timezone: userSettings.timezone })
    .from(userSettings)
    .where(eq(userSettings.tenant, tenant))
    .limit(1);
  const computed = computeTenantAggregates(tenant, visitSelect, activitySelect, settingsRows[0]?.timezone);
  await replaceTenantAggregates(db, tenant, computed);
  return { days: computed.dayStats.length };
}

/** Swap in freshly computed aggregates for a tenant and clear the stale marker. */
export async function replaceTenantAggregates(
  db: Db,
  tenant: TenantId,
  computed: { dayStats: Array<typeof dayStats.$inferInsert>; analytics: Record<string, unknown> },
): Promise<void> {
  await db.execute(sql`DELETE FROM day_stats WHERE tenant = ${tenant}`);
  await db.execute(sql`DELETE FROM analytics_cache WHERE tenant = ${tenant}`);
  for (let i = 0; i < computed.dayStats.length; i += BATCH) {
    await db.insert(dayStats).values(computed.dayStats.slice(i, i + BATCH).map((d) => ({ ...d, tenant })));
  }
  for (const [key, data] of Object.entries(computed.analytics)) {
    await db
      .insert(analyticsCache)
      .values({ tenant, key, data })
      .onConflictDoUpdate({
        target: [analyticsCache.tenant, analyticsCache.key],
        set: { data, updatedAt: new Date() },
      });
  }
}

/** Rebuild the analytics that depend on local time after a timezone change. */
export async function rebuildHourOfWeekCache(
  db: Db,
  tenant: TenantId,
  timezone?: string | null,
): Promise<void> {
  const visitSelect = await db.select().from(visits).where(eq(visits.tenant, tenant));
  const { path: _path, ...activityColumns } = getTableColumns(activities);
  const activitySelect = (
    await db.select(activityColumns).from(activities).where(eq(activities.tenant, tenant))
  ).map((row) => ({ ...row, path: null }));
  const daySelect = await db.select().from(dayStats).where(eq(dayStats.tenant, tenant));
  const store = buildStore(visitSelect, activitySelect, daySelect);
  const caches: Record<string, unknown> = {
    "hour-of-week": computeHourOfWeek(store, timezone),
    "home-work": inferHomeWork(store, timezone),
    "away-nights": computeAwayNights(store, timezone),
    commute: computeCommute(store, timezone),
    moving: computeMovingHistory(store, timezone),
  };
  for (const [key, data] of Object.entries(caches)) {
    if (data === null || data === undefined) {
      await db
        .delete(analyticsCache)
        .where(and(eq(analyticsCache.tenant, tenant), eq(analyticsCache.key, key)));
      continue;
    }
    await db
      .insert(analyticsCache)
      .values({ tenant, key, data })
      .onConflictDoUpdate({
        target: [analyticsCache.tenant, analyticsCache.key],
        set: { data, updatedAt: new Date() },
      });
  }
}

/**
 * Replace location rows for one source, then rebuild tenant aggregates.
 */
export async function importSourceData(
  db: Db,
  opts: {
    tenant: TenantId;
    sourceId: string;
    records: unknown;
    merge?: boolean;
    skipOverlappingDays?: boolean;
    aggregates?: AggregateMode;
  },
): Promise<{ visitCount: number; activityCount: number; days: number }> {
  const { tenant, sourceId } = opts;
  const parsed = parseTimelineJson(opts.records);

  if (!opts.merge) {
    await db
      .delete(visits)
      .where(and(eq(visits.tenant, tenant), eq(visits.sourceId, sourceId)));
    await db
      .delete(activities)
      .where(and(eq(activities.tenant, tenant), eq(activities.sourceId, sourceId)));
  }

  let visitDrafts = parsed.visits;
  let activityDrafts = parsed.activities;
  if (opts.merge && opts.skipOverlappingDays) {
    const existing = new Set<string>();
    const visitDates = await db
      .select({ date: visits.date })
      .from(visits)
      .where(and(eq(visits.tenant, tenant), eq(visits.sourceId, sourceId)));
    const activityDates = await db
      .select({ date: activities.date })
      .from(activities)
      .where(and(eq(activities.tenant, tenant), eq(activities.sourceId, sourceId)));
    for (const row of visitDates) existing.add(row.date);
    for (const row of activityDates) existing.add(row.date);
    visitDrafts = visitDrafts.filter((v) => !existing.has(v.date));
    activityDrafts = activityDrafts.filter((a) => !existing.has(a.date));
  }

  const visitRows = visitDrafts.map((v) => ({
    ...v,
    tenant,
    sourceId,
  }));
  const activityRows = activityDrafts.map((a) => ({
    ...a,
    tenant,
    sourceId,
  }));

  for (let i = 0; i < visitRows.length; i += BATCH) {
    await db.insert(visits).values(visitRows.slice(i, i + BATCH));
  }
  for (let i = 0; i < activityRows.length; i += BATCH) {
    await db.insert(activities).values(activityRows.slice(i, i + BATCH));
  }

  await db
    .update(dataSources)
    .set({ updatedAt: new Date() })
    .where(eq(dataSources.id, sourceId));

  // Google's own trips become named trips; existing ones (maybe renamed) are kept.
  const trips = namedTripsFromMemories(parsed.memories ?? [], sourceId);
  for (let i = 0; i < trips.length; i += BATCH) {
    await db
      .insert(schema.namedTrips)
      .values(trips.slice(i, i + BATCH).map((t) => ({ ...t, tenant })))
      .onConflictDoNothing();
  }

  const { days } = await afterDataChange(db, tenant, opts.aggregates ?? "rebuild");

  return {
    visitCount: visitRows.length,
    activityCount: activityRows.length,
    days,
  };
}

/**
 * Keep only one source in a tenant: delete rows from every other source (and
 * rows with no source), drop the other data_sources, then rebuild aggregates.
 * Used for the demo tenant so a re-import cannot leave duplicate journeys.
 */
export async function pruneTenantToSource(
  db: Db,
  opts: { tenant: TenantId; sourceId: string; aggregates?: AggregateMode },
): Promise<{ days: number }> {
  const { tenant, sourceId } = opts;
  await db
    .delete(visits)
    .where(and(eq(visits.tenant, tenant), or(isNull(visits.sourceId), ne(visits.sourceId, sourceId))));
  await db
    .delete(activities)
    .where(
      and(eq(activities.tenant, tenant), or(isNull(activities.sourceId), ne(activities.sourceId, sourceId))),
    );
  await db
    .delete(dataSources)
    .where(and(eq(dataSources.tenant, tenant), ne(dataSources.id, sourceId)));
  return afterDataChange(db, tenant, opts.aggregates ?? "rebuild");
}

/** Delete a source and its rows, then update tenant aggregates. */
export async function deleteSourceData(
  db: Db,
  opts: { tenant: TenantId; sourceId: string; aggregates?: AggregateMode },
): Promise<{ days: number }> {
  const { tenant, sourceId } = opts;
  await db
    .delete(visits)
    .where(and(eq(visits.tenant, tenant), eq(visits.sourceId, sourceId)));
  await db
    .delete(activities)
    .where(and(eq(activities.tenant, tenant), eq(activities.sourceId, sourceId)));
  await db
    .delete(dataSources)
    .where(and(eq(dataSources.tenant, tenant), eq(dataSources.id, sourceId)));
  return afterDataChange(db, tenant, opts.aggregates ?? "rebuild");
}

/** Delete visits and activities in an inclusive date window, then rebuild aggregates. */
export async function deleteDateRange(
  db: Db,
  opts: { tenant: TenantId; from: string; to: string; sourceId?: string; aggregates?: AggregateMode },
): Promise<{ visitCount: number; activityCount: number; days: number }> {
  const { tenant, from, to, sourceId } = opts;
  const visitFilters = [eq(visits.tenant, tenant), gte(visits.date, from), lte(visits.date, to)];
  const activityFilters = [
    eq(activities.tenant, tenant),
    gte(activities.date, from),
    lte(activities.date, to),
  ];
  if (sourceId) {
    visitFilters.push(eq(visits.sourceId, sourceId));
    activityFilters.push(eq(activities.sourceId, sourceId));
  }
  const [visitCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(visits)
    .where(and(...visitFilters));
  const [activityCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(activities)
    .where(and(...activityFilters));
  await db.delete(visits).where(and(...visitFilters));
  await db.delete(activities).where(and(...activityFilters));
  const { days } = await afterDataChange(db, tenant, opts.aggregates ?? "rebuild");
  return {
    visitCount: visitCountRow?.count ?? 0,
    activityCount: activityCountRow?.count ?? 0,
    days,
  };
}

/** Find or create a data_sources row for tenant + label. */
export async function ensureDataSource(
  db: Db,
  opts: { tenant: TenantId; label: string; id?: string },
): Promise<{ id: string; label: string; created: boolean }> {
  const label = opts.label.trim();
  if (!label) throw new Error("Source label is required");

  const existing = await db
    .select()
    .from(dataSources)
    .where(and(eq(dataSources.tenant, opts.tenant), eq(dataSources.label, label)))
    .limit(1);

  if (existing[0]) {
    return { id: existing[0].id, label: existing[0].label, created: false };
  }

  const id = opts.id ?? randomUUID();
  const now = new Date();
  await db.insert(dataSources).values({
    id,
    tenant: opts.tenant,
    label,
    createdAt: now,
    updatedAt: now,
  });
  return { id, label, created: true };
}
