import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";
import {
  activities,
  analyticsCache,
  dayStats,
  visits,
} from "./schema.js";
import {
  classifyLocation,
  mapTransportMode,
  METERS_TO_MILES,
  parseGeo,
} from "./geo.js";
import { buildStore, computeAllAnalytics } from "./analytics.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../.env") });
config({ path: resolve(__dirname, "../../../.dev.vars") });

type RawRecord = {
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

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const root = resolve(__dirname, "../../..");
  const dataPath = process.env.DATA_PATH
    ? resolve(root, process.env.DATA_PATH)
    : resolve(root, "../location-history.json");

  console.log(`Reading ${dataPath}...`);
  const raw = JSON.parse(readFileSync(dataPath, "utf-8")) as RawRecord[];
  console.log(`Parsed ${raw.length} records`);

  const visitRows: (typeof visits.$inferInsert)[] = [];
  const activityRows: (typeof activities.$inferInsert)[] = [];

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

  console.log(`Visits: ${visitRows.length}, Activities: ${activityRows.length}`);

  // Build day stats
  const dayMap = new Map<
    string,
    {
      visits: typeof visitRows;
      activities: typeof activityRows;
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
  for (const [date, day] of [...dayMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const totalDist =
      day.activities.reduce((s, a) => s + a.distanceMeters, 0) * METERS_TO_MILES;
    const modes: Record<string, number> = {};
    for (const a of day.activities) modes[a.mode] = (modes[a.mode] ?? 0) + 1;
    const clusters: string[] = [];
    for (const v of day.visits) {
      if (!clusters.includes(v.cluster)) clusters.push(v.cluster);
    }
    dayStatRows.push({
      date,
      totalDistanceMiles: Math.round(totalDist * 10) / 10,
      modes,
      clusters,
      visitCount: day.visits.length,
      activityCount: day.activities.length,
    });
  }

  const db = drizzle(neon(url));

  console.log("Clearing existing location tables...");
  await db.execute(sql`TRUNCATE visits, activities, day_stats, analytics_cache RESTART IDENTITY`);

  console.log("Inserting visits...");
  const BATCH = 500;
  for (let i = 0; i < visitRows.length; i += BATCH) {
    await db.insert(visits).values(visitRows.slice(i, i + BATCH));
    if (i % 2000 === 0) console.log(`  visits ${i}/${visitRows.length}`);
  }

  console.log("Inserting activities...");
  for (let i = 0; i < activityRows.length; i += BATCH) {
    await db.insert(activities).values(activityRows.slice(i, i + BATCH));
    if (i % 2000 === 0) console.log(`  activities ${i}/${activityRows.length}`);
  }

  console.log("Inserting day stats...");
  for (let i = 0; i < dayStatRows.length; i += BATCH) {
    await db.insert(dayStats).values(dayStatRows.slice(i, i + BATCH));
  }

  console.log("Computing analytics...");
  // Need rows with ids — re-query or synthesize
  const visitSelect = await db.select().from(visits);
  const activitySelect = await db.select().from(activities);
  const daySelect = await db.select().from(dayStats);
  const store = buildStore(visitSelect, activitySelect, daySelect);
  const analytics = computeAllAnalytics(store);

  for (const [key, data] of Object.entries(analytics)) {
    await db
      .insert(analyticsCache)
      .values({ key, data })
      .onConflictDoUpdate({
        target: analyticsCache.key,
        set: { data, updatedAt: new Date() },
      });
  }

  console.log("Import complete.");
  console.log({
    visits: visitRows.length,
    activities: activityRows.length,
    days: dayStatRows.length,
    dateRange: store.allDates.length
      ? [store.allDates[0], store.allDates[store.allDates.length - 1]]
      : [],
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
