import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema.js";
import {
  activities,
  analyticsCache,
  dataSources,
  dayStats,
  visits,
  type TenantId,
} from "./schema.js";
import {
  classifyLocation,
  mapTransportMode,
  METERS_TO_MILES,
  parseGeo,
} from "./geo.js";
import { buildStore, computeAllAnalytics } from "./analytics.js";

type Db = NeonHttpDatabase<typeof schema>;

export type RawTimelineRecord = {
  startTime?: string;
  endTime?: string;
  visit?: {
    topCandidate?: {
      placeLocation?: string;
      semanticType?: string;
      placeID?: string;
    };
  };
  activity?: {
    start?: string;
    end?: string;
    distanceMeters?: number | string;
    topCandidate?: { type?: string };
  };
};

type VisitDraft = {
  start: string;
  end: string;
  date: string;
  lat: number;
  lon: number;
  cluster: string;
  semanticType: string;
  placeId: string | null;
  durationMinutes: number;
};

type ActivityDraft = {
  start: string;
  end: string;
  date: string;
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
  mode: string;
  distanceMeters: number;
  durationMinutes: number;
};

export type ParsedTimeline = {
  visits: VisitDraft[];
  activities: ActivityDraft[];
};

const BATCH = 500;

function latLngFromE7(point: { latE7?: number; lngE7?: number } | null | undefined): [number, number] | null {
  if (!point || point.latE7 == null || point.lngE7 == null) return null;
  return [point.latE7 / 1e7, point.lngE7 / 1e7];
}

function toGeo(lat: number, lon: number): string {
  return `geo:${lat},${lon}`;
}

function titleCaseSemantic(raw: string | undefined | null): string {
  if (!raw) return "Unknown";
  const lower = raw.replace(/_/g, " ").toLowerCase();
  if (lower === "unknown") return "Unknown";
  return lower.replace(/\b\w/g, (c) => c.toUpperCase());
}

type TimelineEdit = {
  inferredSemanticSegment?: SemanticSegment;
  userEditedSemanticSegment?: SemanticSegment;
  rawSignal?: {
    signal?: {
      position?: {
        point?: { latE7?: number; lngE7?: number };
        timestamp?: string;
      };
    };
  };
};

type SemanticSegment = {
  startTime?: string;
  endTime?: string;
  segment?: {
    visit?: {
      topCandidate?: {
        placeId?: string;
        placeID?: string;
        semanticType?: string;
        placeLocation?: string | { latE7?: number; lngE7?: number };
      };
    };
    activity?: {
      start?: string | { latE7?: number; lngE7?: number };
      end?: string | { latE7?: number; lngE7?: number };
      distanceMeters?: number | string;
      topCandidate?: { type?: string };
    };
  };
};

/** Normalize classic array + Timeline Edits exports into RawTimelineRecord[]. */
export function normalizeTimelineInput(raw: unknown): RawTimelineRecord[] {
  if (raw === null || typeof raw !== "object") {
    throw new Error("Timeline JSON must be an array or a Timeline Edits object");
  }

  if (Array.isArray(raw)) return raw as RawTimelineRecord[];

  const obj = raw as Record<string, unknown>;
  if ("timelineEnabled" in obj || "deviceSettings" in obj) {
    throw new Error(
      "This looks like Timeline Settings.json, not location history. Use Timeline Edits.json or a visit/activity array.",
    );
  }

  if (!Array.isArray(obj.timelineEdits)) {
    throw new Error("Timeline JSON must be an array of visit/activity records or a Timeline Edits export");
  }

  const edits = obj.timelineEdits as TimelineEdit[];
  const records: RawTimelineRecord[] = [];
  const seenSegmentKeys = new Set<string>();

  // Prefer user-edited segments over inferred for the same time window.
  const segments: Array<{ seg: SemanticSegment; edited: boolean }> = [];
  for (const edit of edits) {
    if (edit.userEditedSemanticSegment) {
      segments.push({ seg: edit.userEditedSemanticSegment, edited: true });
    }
    if (edit.inferredSemanticSegment) {
      segments.push({ seg: edit.inferredSemanticSegment, edited: false });
    }
  }
  segments.sort((a, b) => Number(b.edited) - Number(a.edited));

  for (const { seg } of segments) {
    const startTime = seg.startTime ?? "";
    const endTime = seg.endTime ?? "";
    if (!startTime || !endTime) continue;
    const key = `${startTime.slice(0, 16)}|${endTime.slice(0, 16)}|${seg.segment?.visit ? "v" : "a"}`;
    if (seenSegmentKeys.has(key)) continue;
    seenSegmentKeys.add(key);

    if (seg.segment?.visit) {
      const top = seg.segment.visit.topCandidate ?? {};
      let placeLocation: string | undefined;
      if (typeof top.placeLocation === "string") {
        placeLocation = top.placeLocation;
      } else {
        const coords = latLngFromE7(top.placeLocation);
        if (coords) placeLocation = toGeo(coords[0], coords[1]);
      }
      records.push({
        startTime,
        endTime,
        visit: {
          topCandidate: {
            placeLocation,
            semanticType: titleCaseSemantic(top.semanticType),
            placeID: top.placeId ?? top.placeID,
          },
        },
      });
    } else if (seg.segment?.activity) {
      const act = seg.segment.activity;
      const startCoords =
        typeof act.start === "string" ? parseGeo(act.start) : latLngFromE7(act.start);
      const endCoords =
        typeof act.end === "string" ? parseGeo(act.end) : latLngFromE7(act.end);
      if (!startCoords || !endCoords) continue;
      records.push({
        startTime,
        endTime,
        activity: {
          start: toGeo(startCoords[0], startCoords[1]),
          end: toGeo(endCoords[0], endCoords[1]),
          distanceMeters: act.distanceMeters,
          topCandidate: { type: act.topCandidate?.type },
        },
      });
    }
  }

  // Position pings → short visits so heatmaps work when semantic history is sparse.
  for (const edit of edits) {
    const position = edit.rawSignal?.signal?.position;
    if (!position?.timestamp) continue;
    const coords = latLngFromE7(position.point);
    if (!coords) continue;
    const startTime = position.timestamp;
    const endDt = new Date(startTime);
    endDt.setMinutes(endDt.getMinutes() + 2);
    const endTime = endDt.toISOString();
    records.push({
      startTime,
      endTime,
      visit: {
        topCandidate: {
          placeLocation: toGeo(coords[0], coords[1]),
          semanticType: "Unknown",
        },
      },
    });
  }

  return records;
}

function parseClassicRecords(raw: RawTimelineRecord[]): ParsedTimeline {
  const visitRows: VisitDraft[] = [];
  const activityRows: ActivityDraft[] = [];

  for (const record of raw) {
    const startTime = record.startTime ?? "";
    const endTime = record.endTime ?? "";
    if (!startTime || !endTime) continue;

    if (record.visit) {
      const top = record.visit.topCandidate ?? {};
      const coords = parseGeo(top.placeLocation);
      if (!coords) continue;
      const startDt = new Date(startTime);
      const endDt = new Date(endTime);
      const duration = (endDt.getTime() - startDt.getTime()) / 60000;
      visitRows.push({
        start: startTime,
        end: endTime,
        date: startTime.slice(0, 10),
        lat: coords[0],
        lon: coords[1],
        cluster: classifyLocation(coords[0], coords[1]),
        semanticType: top.semanticType ?? "Unknown",
        placeId: top.placeID ?? null,
        durationMinutes: Math.round(duration * 10) / 10,
      });
    } else if (record.activity) {
      const act = record.activity;
      const top = act.topCandidate ?? {};
      const startCoords = parseGeo(act.start);
      const endCoords = parseGeo(act.end);
      if (!startCoords || !endCoords) continue;
      const startDt = new Date(startTime);
      const endDt = new Date(endTime);
      const duration = (endDt.getTime() - startDt.getTime()) / 60000;
      activityRows.push({
        start: startTime,
        end: endTime,
        date: startTime.slice(0, 10),
        startLat: startCoords[0],
        startLon: startCoords[1],
        endLat: endCoords[0],
        endLon: endCoords[1],
        mode: mapTransportMode(top.type ?? "unknown"),
        distanceMeters: Number(act.distanceMeters ?? 0),
        durationMinutes: Math.round(duration * 10) / 10,
      });
    }
  }

  return { visits: visitRows, activities: activityRows };
}

/** Parse Google Timeline JSON (classic array or Timeline Edits export). */
export function parseTimelineJson(raw: unknown): ParsedTimeline {
  const records = normalizeTimelineInput(raw);
  const parsed = parseClassicRecords(records);

  if (parsed.visits.length === 0 && parsed.activities.length === 0) {
    throw new Error(
      "No visit or activity records found. Ensure the file is Timeline Edits.json or a visit/activity JSON array.",
    );
  }

  return parsed;
}

function buildDayStatRows(
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

  const dayStatRows: (typeof dayStats.$inferInsert)[] = [];
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

/** Rebuild day_stats + analytics_cache for a tenant from all sources. */
export async function rebuildTenantAggregates(
  db: Db,
  tenant: TenantId,
): Promise<{ days: number }> {
  await db.execute(sql`DELETE FROM day_stats WHERE tenant = ${tenant}`);
  await db.execute(sql`DELETE FROM analytics_cache WHERE tenant = ${tenant}`);

  const visitSelect = await db
    .select()
    .from(visits)
    .where(eq(visits.tenant, tenant));
  const activitySelect = await db
    .select()
    .from(activities)
    .where(eq(activities.tenant, tenant));

  const dayStatRows = buildDayStatRows(tenant, visitSelect, activitySelect);

  for (let i = 0; i < dayStatRows.length; i += BATCH) {
    await db.insert(dayStats).values(dayStatRows.slice(i, i + BATCH));
  }

  const daySelect = await db
    .select()
    .from(dayStats)
    .where(eq(dayStats.tenant, tenant));
  const store = buildStore(visitSelect, activitySelect, daySelect);
  const analytics = computeAllAnalytics(store);

  for (const [key, data] of Object.entries(analytics)) {
    await db
      .insert(analyticsCache)
      .values({ tenant, key, data })
      .onConflictDoUpdate({
        target: [analyticsCache.tenant, analyticsCache.key],
        set: { data, updatedAt: new Date() },
      });
  }

  return { days: dayStatRows.length };
}

/**
 * Replace location rows for one source, then rebuild tenant aggregates.
 */
export async function importSourceData(
  db: Db,
  opts: { tenant: TenantId; sourceId: string; records: unknown },
): Promise<{ visitCount: number; activityCount: number; days: number }> {
  const { tenant, sourceId } = opts;
  const parsed = parseTimelineJson(opts.records);

  await db
    .delete(visits)
    .where(and(eq(visits.tenant, tenant), eq(visits.sourceId, sourceId)));
  await db
    .delete(activities)
    .where(and(eq(activities.tenant, tenant), eq(activities.sourceId, sourceId)));

  const visitRows = parsed.visits.map((v) => ({
    ...v,
    tenant,
    sourceId,
  }));
  const activityRows = parsed.activities.map((a) => ({
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

  const { days } = await rebuildTenantAggregates(db, tenant);

  return {
    visitCount: visitRows.length,
    activityCount: activityRows.length,
    days,
  };
}

/** Delete a source and its rows, then rebuild tenant aggregates. */
export async function deleteSourceData(
  db: Db,
  opts: { tenant: TenantId; sourceId: string },
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
  return rebuildTenantAggregates(db, tenant);
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
