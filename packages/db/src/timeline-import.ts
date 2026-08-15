import { randomUUID } from "node:crypto";
import { and, eq, gte, lte, sql } from "drizzle-orm";
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
  classifyLocation,
  mapTransportMode,
  METERS_TO_MILES,
  parseGeo,
} from "./geo.js";
import { buildStore, computeAllAnalytics, computeHourOfWeek } from "./analytics.js";

type Db = NeonHttpDatabase<typeof schema> | NeonDatabase<typeof schema>;

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

/** Parse `"51.3667281°, -0.1896562°"` style coordinates from Timeline.json. */
function parseDegreeLatLng(raw: string | undefined | null): [number, number] | null {
  if (!raw) return null;
  const m = raw.match(/(-?\d+(?:\.\d+)?)\s*°\s*,\s*(-?\d+(?:\.\d+)?)\s*°/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  return [lat, lon];
}

function coordsFromLocation(
  loc:
    | string
    | { latE7?: number; lngE7?: number; latLng?: string }
    | null
    | undefined,
): [number, number] | null {
  if (!loc) return null;
  if (typeof loc === "string") {
    return parseGeo(loc) ?? parseDegreeLatLng(loc);
  }
  if (loc.latLng) return parseDegreeLatLng(loc.latLng);
  return latLngFromE7(loc);
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
  inferredSemanticSegment?: NestedSemanticSegment;
  userEditedSemanticSegment?: NestedSemanticSegment;
  rawSignal?: {
    signal?: {
      position?: {
        point?: { latE7?: number; lngE7?: number };
        timestamp?: string;
      };
    };
  };
};

type NestedSemanticSegment = {
  startTime?: string;
  endTime?: string;
  segment?: {
    visit?: SemanticVisit;
    activity?: SemanticActivity;
  };
};

type SemanticVisit = {
  topCandidate?: {
    placeId?: string;
    placeID?: string;
    semanticType?: string;
    placeLocation?: string | { latE7?: number; lngE7?: number; latLng?: string };
  };
};

type SemanticActivity = {
  start?: string | { latE7?: number; lngE7?: number; latLng?: string };
  end?: string | { latE7?: number; lngE7?: number; latLng?: string };
  distanceMeters?: number | string;
  topCandidate?: { type?: string };
};

type FlatSemanticSegment = {
  startTime?: string;
  endTime?: string;
  visit?: SemanticVisit;
  activity?: SemanticActivity;
  timelinePath?: unknown;
};

function pushVisitActivity(
  records: RawTimelineRecord[],
  startTime: string,
  endTime: string,
  visit: SemanticVisit | undefined,
  activity: SemanticActivity | undefined,
) {
  if (visit) {
    const top = visit.topCandidate ?? {};
    const coords = coordsFromLocation(top.placeLocation);
    if (!coords) return;
    records.push({
      startTime,
      endTime,
      visit: {
        topCandidate: {
          placeLocation: toGeo(coords[0], coords[1]),
          semanticType: titleCaseSemantic(top.semanticType),
          placeID: top.placeId ?? top.placeID,
        },
      },
    });
    return;
  }

  if (activity) {
    const startCoords = coordsFromLocation(activity.start);
    const endCoords = coordsFromLocation(activity.end);
    if (!startCoords || !endCoords) return;
    records.push({
      startTime,
      endTime,
      activity: {
        start: toGeo(startCoords[0], startCoords[1]),
        end: toGeo(endCoords[0], endCoords[1]),
        distanceMeters: activity.distanceMeters,
        topCandidate: { type: activity.topCandidate?.type },
      },
    });
  }
}

function fromSemanticSegments(segments: FlatSemanticSegment[]): RawTimelineRecord[] {
  const records: RawTimelineRecord[] = [];
  for (const seg of segments) {
    const startTime = seg.startTime ?? "";
    const endTime = seg.endTime ?? "";
    if (!startTime || !endTime) continue;
    if (!seg.visit && !seg.activity) continue;
    pushVisitActivity(records, startTime, endTime, seg.visit, seg.activity);
  }
  return records;
}

function fromTimelineEdits(edits: TimelineEdit[]): RawTimelineRecord[] {
  const records: RawTimelineRecord[] = [];
  const seenSegmentKeys = new Set<string>();

  const segments: Array<{ seg: NestedSemanticSegment; edited: boolean }> = [];
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
    pushVisitActivity(records, startTime, endTime, seg.segment?.visit, seg.segment?.activity);
  }

  for (const edit of edits) {
    const position = edit.rawSignal?.signal?.position;
    if (!position?.timestamp) continue;
    const coords = latLngFromE7(position.point);
    if (!coords) continue;
    const startTime = position.timestamp;
    const endDt = new Date(startTime);
    endDt.setMinutes(endDt.getMinutes() + 2);
    records.push({
      startTime,
      endTime: endDt.toISOString(),
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

/** Normalize classic array, semanticSegments Timeline.json, or Timeline Edits. */
export function normalizeTimelineInput(raw: unknown): RawTimelineRecord[] {
  if (raw === null || typeof raw !== "object") {
    throw new Error("Timeline JSON must be an array or a Timeline export object");
  }

  if (Array.isArray(raw)) return raw as RawTimelineRecord[];

  const obj = raw as Record<string, unknown>;
  if ("timelineEnabled" in obj || "deviceSettings" in obj) {
    throw new Error(
      "This looks like Timeline Settings.json, not location history. Use Timeline.json (semanticSegments) or Timeline Edits.json.",
    );
  }

  if (Array.isArray(obj.semanticSegments)) {
    return fromSemanticSegments(obj.semanticSegments as FlatSemanticSegment[]);
  }

  if (Array.isArray(obj.timelineEdits)) {
    return fromTimelineEdits(obj.timelineEdits as TimelineEdit[]);
  }

  if (Array.isArray(obj.locations)) {
    return fromRecordsJson(obj.locations as Array<Record<string, unknown>>);
  }

  throw new Error(
    "Timeline JSON must be a visit/activity array, a semanticSegments Timeline.json, a Timeline Edits export, or Records.json",
  );
}

function fromRecordsJson(locations: Array<Record<string, unknown>>): RawTimelineRecord[] {
  const records: RawTimelineRecord[] = [];
  for (const loc of locations) {
    const latE7 = Number(loc.latitudeE7 ?? loc.latE7);
    const lngE7 = Number(loc.longitudeE7 ?? loc.lngE7);
    if (!Number.isFinite(latE7) || !Number.isFinite(lngE7)) continue;
    const ts =
      (typeof loc.timestamp === "string" && loc.timestamp) ||
      (typeof loc.timestampMs === "string" && loc.timestampMs) ||
      (typeof loc.timestampMs === "number" && String(loc.timestampMs)) ||
      "";
    if (!ts) continue;
    const startIso = ts.length < 13 && /^\d+$/.test(ts) ? new Date(Number(ts)).toISOString() : ts.includes("T") ? ts : new Date(Number(ts)).toISOString();
    const endDt = new Date(startIso);
    if (Number.isNaN(endDt.getTime())) continue;
    endDt.setMinutes(endDt.getMinutes() + 2);
    const lat = latE7 / 1e7;
    const lon = lngE7 / 1e7;
    records.push({
      startTime: startIso,
      endTime: endDt.toISOString(),
      visit: {
        topCandidate: {
          placeLocation: toGeo(lat, lon),
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

export type TimelineFormat = "classic" | "semantic" | "records" | "edits";

export function detectTimelineFormat(raw: unknown): TimelineFormat {
  if (raw === null || typeof raw !== "object") {
    throw new Error("Timeline JSON must be an array or a Timeline export object");
  }
  if (Array.isArray(raw)) return "classic";
  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj.semanticSegments)) return "semantic";
  if (Array.isArray(obj.timelineEdits)) return "edits";
  if (Array.isArray(obj.locations)) return "records";
  throw new Error(
    "Timeline JSON must be a visit/activity array, a semanticSegments Timeline.json, a Timeline Edits export, or Records.json",
  );
}

export function datesFromParsed(parsed: ParsedTimeline): string[] {
  const set = new Set<string>();
  for (const v of parsed.visits) set.add(v.date);
  for (const a of parsed.activities) set.add(a.date);
  return [...set].sort();
}

export function importDayDiff(incoming: string[], existing: string[]) {
  const exist = new Set(existing);
  const incomingSet = new Set(incoming);
  const overlapping = incoming.filter((d) => exist.has(d));
  const newDays = incoming.filter((d) => !exist.has(d));
  return {
    overlappingDays: overlapping.length,
    newDays: newDays.length,
    existingDays: existing.length,
    overlappingSample: overlapping.slice(0, 12),
  };
}

export type TimezoneWarning = {
  warn: boolean;
  skewedShare: number;
  sampleCount: number;
};

/** Compare UTC date vs local calendar date. Does not rewrite stored dates. */
export function timezoneSkewWarning(
  visits: Array<{ start: string; date: string }>,
  timeZone?: string | null,
): TimezoneWarning {
  const tz = timeZone?.trim() || "UTC";
  let skewed = 0;
  let sample = 0;
  for (const v of visits) {
    if (!v.start) continue;
    sample += 1;
    const local = localCalendarDate(v.start, tz);
    if (local && local !== v.date) skewed += 1;
  }
  const skewedShare = sample ? skewed / sample : 0;
  return {
    warn: sample >= 8 && skewedShare >= 0.15,
    skewedShare: Math.round(skewedShare * 1000) / 1000,
    sampleCount: sample,
  };
}

export function localCalendarDate(iso: string, timeZone: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    if (!y || !m || !day) return iso.slice(0, 10);
    return `${y}-${m}-${day}`;
  } catch {
    return iso.slice(0, 10);
  }
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
  const settingsRows = await db
    .select({ timezone: userSettings.timezone })
    .from(userSettings)
    .where(eq(userSettings.tenant, tenant))
    .limit(1);
  const analytics = computeAllAnalytics(store, { timezone: settingsRows[0]?.timezone });

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

/** Rebuild only the hour-of-week cache after a timezone change. */
export async function rebuildHourOfWeekCache(
  db: Db,
  tenant: TenantId,
  timezone?: string | null,
): Promise<void> {
  const visitSelect = await db.select().from(visits).where(eq(visits.tenant, tenant));
  const store = buildStore(visitSelect, [], []);
  const data = computeHourOfWeek(store, timezone);
  await db
    .insert(analyticsCache)
    .values({ tenant, key: "hour-of-week", data })
    .onConflictDoUpdate({
      target: [analyticsCache.tenant, analyticsCache.key],
      set: { data, updatedAt: new Date() },
    });
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

/** Delete visits and activities in an inclusive date window, then rebuild aggregates. */
export async function deleteDateRange(
  db: Db,
  opts: { tenant: TenantId; from: string; to: string; sourceId?: string },
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
  const { days } = await rebuildTenantAggregates(db, tenant);
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
