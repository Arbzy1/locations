import {
  activities,
  analyticsCache,
  createDb,
  dayStats,
  importJobs,
  lifeChapters,
  namedTrips,
  placeLabels,
  visits,
  dataSources,
  and,
  eq,
  sql,
  desc,
  or,
  ilike,
  gte,
  lte,
  type TenantId,
} from "@locations/db";

type Db = ReturnType<typeof createDb>;

async function hiddenPlaceKeySet(db: Db, tenant: TenantId): Promise<Set<string>> {
  const rows = await db
    .select({ placeKey: placeLabels.placeKey, hidden: placeLabels.hidden })
    .from(placeLabels)
    .where(eq(placeLabels.tenant, tenant));
  return new Set(rows.filter((r) => r.hidden).map((r) => r.placeKey));
}

export async function listClusters(
  db: Db,
  tenant: TenantId,
  opts: { q?: string; sort?: string; limit?: number; cursor?: string },
) {
  const hidden = await hiddenPlaceKeySet(db, tenant);
  const filters = [eq(visits.tenant, tenant)];
  const q = opts.q?.trim().slice(0, 80);
  if (q && q.length >= 2) filters.push(ilike(visits.cluster, `%${q}%`));
  const rows = await db
    .select({
      cluster: visits.cluster,
      count: sql<number>`count(*)::int`,
      duration: sql<number>`coalesce(sum(${visits.durationMinutes}), 0)`,
      lat: sql<number>`avg(${visits.lat})`,
      lon: sql<number>`avg(${visits.lon})`,
      first: sql<string>`min(${visits.date})`,
      last: sql<string>`max(${visits.date})`,
    })
    .from(visits)
    .where(and(...filters))
    .groupBy(visits.cluster);

  const labels = await db
    .select()
    .from(placeLabels)
    .where(eq(placeLabels.tenant, tenant));
  const labelByKey = new Map(labels.map((l) => [l.placeKey, l.label]));

  let list = rows
    .filter((r) => !hidden.has(r.cluster))
    .map((r) => ({
      cluster: r.cluster,
      label: labelByKey.get(r.cluster) || r.cluster,
      visits: r.count,
      duration_minutes: Number(r.duration) || 0,
      lat: Number(r.lat),
      lon: Number(r.lon),
      first: r.first,
      last: r.last,
    }));

  const sort = opts.sort || "visits";
  list.sort((a, b) => {
    if (sort === "name") return a.label.localeCompare(b.label);
    if (sort === "duration") return b.duration_minutes - a.duration_minutes;
    return b.visits - a.visits;
  });

  if (opts.cursor) {
    const idx = list.findIndex((c) => c.cluster === opts.cursor);
    if (idx >= 0) list = list.slice(idx + 1);
  }
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const page = list.slice(0, limit);
  const next = list.length > limit ? page[page.length - 1]?.cluster : null;
  return { clusters: page, cursor: next };
}

export async function getCluster(db: Db, tenant: TenantId, key: string) {
  const cluster = key.slice(0, 200);
  const hidden = await hiddenPlaceKeySet(db, tenant);
  const rows = await db
    .select({
      cluster: visits.cluster,
      count: sql<number>`count(*)::int`,
      duration: sql<number>`coalesce(sum(${visits.durationMinutes}), 0)`,
      lat: sql<number>`avg(${visits.lat})`,
      lon: sql<number>`avg(${visits.lon})`,
      first: sql<string>`min(${visits.date})`,
      last: sql<string>`max(${visits.date})`,
    })
    .from(visits)
    .where(and(eq(visits.tenant, tenant), eq(visits.cluster, cluster)))
    .groupBy(visits.cluster)
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  const sample = await db
    .select({ start: visits.start, date: visits.date })
    .from(visits)
    .where(and(eq(visits.tenant, tenant), eq(visits.cluster, cluster)))
    .limit(400);
  const hours = Array.from({ length: 24 }, () => 0);
  for (const v of sample) {
    const h = new Date(v.start).getUTCHours();
    if (!Number.isNaN(h)) hours[h] += 1;
  }

  const cacheRows = await db
    .select({ data: analyticsCache.data })
    .from(analyticsCache)
    .where(and(eq(analyticsCache.tenant, tenant), eq(analyticsCache.key, "corridors")))
    .limit(1);
  const cached = (cacheRows[0]?.data ?? []) as { from: string; to: string; count: number }[];
  const related = Array.isArray(cached)
    ? cached.filter((c) => c.from === cluster || c.to === cluster).slice(0, 12)
    : [];

  const labels = await db
    .select()
    .from(placeLabels)
    .where(and(eq(placeLabels.tenant, tenant), eq(placeLabels.placeKey, cluster)))
    .limit(1);

  return {
    cluster,
    label: labels[0]?.label || cluster,
    hidden: hidden.has(cluster),
    visits: row.count,
    duration_minutes: Number(row.duration) || 0,
    lat: Number(row.lat),
    lon: Number(row.lon),
    first: row.first,
    last: row.last,
    hour_histogram: hours,
    corridors: related,
  };
}

export async function listClusterVisits(
  db: Db,
  tenant: TenantId,
  key: string,
  opts: { from?: string; to?: string; limit?: number; cursor?: string },
) {
  const cluster = key.slice(0, 200);
  const filters = [eq(visits.tenant, tenant), eq(visits.cluster, cluster)];
  if (opts.from) filters.push(gte(visits.date, opts.from));
  if (opts.to) filters.push(lte(visits.date, opts.to));
  if (opts.cursor) filters.push(sql`${visits.start} < ${opts.cursor}`);
  const limit = Math.min(Math.max(opts.limit ?? 40, 1), 100);
  const rows = await db
    .select({
      date: visits.date,
      start: visits.start,
      end: visits.end,
      duration_minutes: visits.durationMinutes,
      semantic_type: visits.semanticType,
      lat: visits.lat,
      lon: visits.lon,
    })
    .from(visits)
    .where(and(...filters))
    .orderBy(desc(visits.start))
    .limit(limit);
  return {
    visits: rows,
    cursor: rows.length === limit ? rows[rows.length - 1]?.start : null,
  };
}

export async function getCorridorDetail(db: Db, tenant: TenantId, a: string, b: string) {
  const from = a.slice(0, 200);
  const to = b.slice(0, 200);
  const [left, right] = [from, to].sort();
  const days = await db
    .select({
      date: visits.date,
      start: visits.start,
      end: visits.end,
      cluster: visits.cluster,
      lat: visits.lat,
      lon: visits.lon,
    })
    .from(visits)
    .where(
      and(
        eq(visits.tenant, tenant),
        or(eq(visits.cluster, left), eq(visits.cluster, right)),
      ),
    )
    .orderBy(visits.start)
    .limit(2000);

  const acts = await db
    .select({
      date: activities.date,
      start: activities.start,
      end: activities.end,
      mode: activities.mode,
      duration_minutes: activities.durationMinutes,
      start_lat: activities.startLat,
      start_lon: activities.startLon,
      end_lat: activities.endLat,
      end_lon: activities.endLon,
    })
    .from(activities)
    .where(eq(activities.tenant, tenant))
    .limit(4000);

  const byDate = new Map<string, typeof days>();
  for (const v of days) {
    const list = byDate.get(v.date) ?? [];
    list.push(v);
    byDate.set(v.date, list);
  }
  const transitions: {
    date: string;
    from: string;
    to: string;
    mode: string;
    duration_minutes: number;
  }[] = [];
  let fromLat = 0;
  let fromLon = 0;
  let toLat = 0;
  let toLon = 0;
  let fromN = 0;
  let toN = 0;
  for (const v of days) {
    if (v.cluster === left) {
      fromLat += v.lat;
      fromLon += v.lon;
      fromN += 1;
    } else {
      toLat += v.lat;
      toLon += v.lon;
      toN += 1;
    }
  }
  for (const [date, list] of byDate) {
    const sorted = [...list].sort((x, y) => x.start.localeCompare(y.start));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const next = sorted[i];
      if (prev.cluster === next.cluster) continue;
      const pair = [prev.cluster, next.cluster].sort();
      if (pair[0] !== left || pair[1] !== right) continue;
      const act = acts.find((a) => a.date === date && a.start >= prev.start && a.start <= next.start);
      transitions.push({
        date,
        from: prev.cluster,
        to: next.cluster,
        mode: act?.mode || "unknown",
        duration_minutes: act?.duration_minutes ?? 0,
      });
    }
  }
  if (transitions.length === 0) return null;
  return {
    from: left,
    to: right,
    count: transitions.length,
    from_lat: fromN ? fromLat / fromN : null,
    from_lon: fromN ? fromLon / fromN : null,
    to_lat: toN ? toLat / toN : null,
    to_lon: toN ? toLon / toN : null,
    transitions: transitions.slice(0, 80),
  };
}

export async function getTripRange(db: Db, tenant: TenantId, start: string, end: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) {
    return { error: "Invalid range" as const };
  }
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last && dates.length < 14) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  const visitRows = await db
    .select()
    .from(visits)
    .where(and(eq(visits.tenant, tenant), gte(visits.date, start), lte(visits.date, dates[dates.length - 1]!)))
    .orderBy(visits.start);
  const activityRows = await db
    .select()
    .from(activities)
    .where(
      and(eq(activities.tenant, tenant), gte(activities.date, start), lte(activities.date, dates[dates.length - 1]!)),
    )
    .orderBy(activities.start);
  const stats = await db
    .select()
    .from(dayStats)
    .where(and(eq(dayStats.tenant, tenant), gte(dayStats.date, start), lte(dayStats.date, dates[dates.length - 1]!)));
  const miles = stats.reduce((s, d) => s + (d.totalDistanceMiles || 0), 0);
  return {
    start,
    end: dates[dates.length - 1],
    dates,
    truncated: end > dates[dates.length - 1]!,
    total_miles: miles,
    visits: visitRows.map((v) => ({
      start: v.start,
      end: v.end,
      lat: v.lat,
      lon: v.lon,
      cluster: v.cluster,
      semantic_type: v.semanticType,
      duration_minutes: v.durationMinutes,
    })),
    activities: activityRows.map((a) => ({
      start: a.start,
      end: a.end,
      start_lat: a.startLat,
      start_lon: a.startLon,
      end_lat: a.endLat,
      end_lon: a.endLon,
      mode: a.mode,
      distance_meters: a.distanceMeters,
      duration_minutes: a.durationMinutes,
    })),
  };
}

export async function listNamedTrips(db: Db, tenant: TenantId) {
  return db.select().from(namedTrips).where(eq(namedTrips.tenant, tenant)).orderBy(desc(namedTrips.updatedAt));
}

export async function upsertNamedTrip(
  db: Db,
  tenant: TenantId,
  body: { id?: string; name: string; start: string; end: string; dates?: string[] },
) {
  const name = body.name.trim().slice(0, 80);
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(body.start) || !/^\d{4}-\d{2}-\d{2}$/.test(body.end)) {
    return { error: "Invalid trip" as const };
  }
  const id = body.id || crypto.randomUUID();
  const now = new Date();
  const dates = body.dates?.length ? body.dates : [body.start, body.end];
  const existing = body.id
    ? await db
        .select({ id: namedTrips.id })
        .from(namedTrips)
        .where(and(eq(namedTrips.tenant, tenant), eq(namedTrips.id, id)))
        .limit(1)
    : [];
  if (body.id && !existing[0]) return { error: "Not found" as const };
  if (existing[0]) {
    await db
      .update(namedTrips)
      .set({ name, start: body.start, end: body.end, dates, updatedAt: now })
      .where(and(eq(namedTrips.tenant, tenant), eq(namedTrips.id, id)));
  } else {
    await db.insert(namedTrips).values({
      id,
      tenant,
      name,
      start: body.start,
      end: body.end,
      dates,
      createdAt: now,
      updatedAt: now,
    });
  }
  return { id, name, start: body.start, end: body.end, dates };
}

export async function deleteNamedTrip(db: Db, tenant: TenantId, id: string) {
  const rows = await db
    .delete(namedTrips)
    .where(and(eq(namedTrips.tenant, tenant), eq(namedTrips.id, id)))
    .returning({ id: namedTrips.id });
  if (!rows[0]) return { error: "Not found" as const };
  return { ok: true as const };
}

export async function listChapters(db: Db, tenant: TenantId) {
  return db.select().from(lifeChapters).where(eq(lifeChapters.tenant, tenant)).orderBy(lifeChapters.start);
}

export async function upsertChapter(
  db: Db,
  tenant: TenantId,
  body: { id?: string; name: string; start: string; end: string },
) {
  const name = body.name.trim().slice(0, 80);
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(body.start) || !/^\d{4}-\d{2}-\d{2}$/.test(body.end)) {
    return { error: "Invalid chapter" as const };
  }
  const id = body.id || crypto.randomUUID();
  const now = new Date();
  const existing = body.id
    ? await db
        .select({ id: lifeChapters.id })
        .from(lifeChapters)
        .where(and(eq(lifeChapters.tenant, tenant), eq(lifeChapters.id, id)))
        .limit(1)
    : [];
  if (body.id && !existing[0]) return { error: "Not found" as const };
  if (existing[0]) {
    await db
      .update(lifeChapters)
      .set({ name, start: body.start, end: body.end, updatedAt: now })
      .where(and(eq(lifeChapters.tenant, tenant), eq(lifeChapters.id, id)));
  } else {
    await db.insert(lifeChapters).values({
      id,
      tenant,
      name,
      start: body.start,
      end: body.end,
      createdAt: now,
      updatedAt: now,
    });
  }
  return { id, name, start: body.start, end: body.end };
}

export async function deleteChapter(db: Db, tenant: TenantId, id: string) {
  const rows = await db
    .delete(lifeChapters)
    .where(and(eq(lifeChapters.tenant, tenant), eq(lifeChapters.id, id)))
    .returning({ id: lifeChapters.id });
  if (!rows[0]) return { error: "Not found" as const };
  return { ok: true as const };
}

export async function listImportJobs(db: Db, tenant: TenantId) {
  const rows = await db
    .select({
      id: importJobs.id,
      sourceId: importJobs.sourceId,
      status: importJobs.status,
      error: importJobs.error,
      visitCount: importJobs.visitCount,
      activityCount: importJobs.activityCount,
      parsedCount: importJobs.parsedCount,
      merge: importJobs.merge,
      chosenFile: importJobs.chosenFile,
      createdAt: importJobs.createdAt,
      updatedAt: importJobs.updatedAt,
    })
    .from(importJobs)
    .where(eq(importJobs.tenant, tenant))
    .orderBy(desc(importJobs.createdAt))
    .limit(100);
  return rows;
}

export async function staffTenantStats(db: Db, tenant: TenantId) {
  const [visitRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(visits)
    .where(eq(visits.tenant, tenant));
  const [sourceRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(dataSources)
    .where(eq(dataSources.tenant, tenant));
  const jobs = await db
    .select({
      id: importJobs.id,
      status: importJobs.status,
      updatedAt: importJobs.updatedAt,
      parsedCount: importJobs.parsedCount,
      visitCount: importJobs.visitCount,
      error: importJobs.error,
    })
    .from(importJobs)
    .where(eq(importJobs.tenant, tenant))
    .orderBy(desc(importJobs.updatedAt))
    .limit(20);
  const now = Date.now();
  const recentJobs = jobs.map((j) => {
    const updated = j.updatedAt ? new Date(j.updatedAt).getTime() : now;
    const ageMinutes = Number.isFinite(updated)
      ? Math.max(0, Math.round((now - updated) / 60_000))
      : 0;
    return {
      id: j.id,
      status: j.status,
      ageMinutes,
      parsedCount: j.parsedCount ?? 0,
      visitCount: j.visitCount ?? 0,
      error: j.error,
    };
  });
  const stuckJobs = recentJobs.filter(
    (j) => (j.status === "pending" || j.status === "processing") && j.ageMinutes >= 15,
  );
  return {
    visitCount: visitRow?.count ?? 0,
    sourceCount: sourceRow?.count ?? 0,
    latestJobStatus: recentJobs[0]?.status ?? null,
    recentJobCount: recentJobs.length,
    stuckJobCount: stuckJobs.length,
    stuckJobs,
    recentJobs,
  };
}
