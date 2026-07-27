import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { activities, routeCache, type RouteStep } from "./schema.js";
import { makeRouteCacheKey } from "./geo.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../.env") });
config({ path: resolve(__dirname, "../../../.dev.vars") });

const OSRM_BASE = "https://router.project-osrm.org/route/v1";
const MODE_TO_PROFILE: Record<string, string> = {
  walking: "foot",
  cycling: "bike",
  car: "driving",
  bus: "driving",
  train: "driving",
  subway: "driving",
  unknown: "driving",
};
const SKIP = new Set(["flying", "train", "subway"]);

const MANEUVER_MAP = new Map<string, string>([
  ["turn|left", "Turn left"],
  ["turn|right", "Turn right"],
  ["turn|sharp left", "Sharp left"],
  ["turn|sharp right", "Sharp right"],
  ["turn|slight left", "Slight left"],
  ["turn|slight right", "Slight right"],
  ["turn|straight", "Continue straight"],
  ["new name|straight", "Continue"],
  ["depart|", "Depart"],
  ["arrive|", "Arrive"],
  ["continue|straight", "Continue straight"],
  ["roundabout|", "Roundabout"],
  ["exit roundabout|", "Exit roundabout"],
]);

function getDirection(maneuver: { type?: string; modifier?: string }): string {
  const type = maneuver.type ?? "";
  const modifier = maneuver.modifier;
  const exact = MANEUVER_MAP.get(`${type}|${modifier ?? ""}`);
  if (exact) return exact;
  const bare = MANEUVER_MAP.get(`${type}|`);
  if (bare) return modifier ? `${bare} (${modifier})` : bare;
  if (modifier) return modifier.replace("slight ", "bear ").replace(/\b\w/g, (c) => c.toUpperCase());
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseSteps(legs: Array<{ steps?: unknown[] }>): RouteStep[] {
  const steps: RouteStep[] = [];
  for (const leg of legs) {
    for (const step of (leg.steps ?? []) as Array<Record<string, unknown>>) {
      let name = (step.name as string) || "";
      const ref = (step.ref as string) || "";
      if (!name && ref) name = ref;
      if (!name) name = ((step.maneuver as { type?: string })?.type) || "road";
      if (ref && ref !== name) name = `${name} (${ref})`;
      const distance_m = Number(step.distance ?? 0);
      const duration_s = Number(step.duration ?? 0);
      const coords = ((step.geometry as { coordinates?: number[][] })?.coordinates) ?? [];
      const geometry = coords.map((c) => [c[1], c[0]] as [number, number]);
      const direction = getDirection((step.maneuver as { type?: string; modifier?: string }) ?? {});
      if (distance_m < 1 && !geometry.length) continue;
      steps.push({
        name,
        distance_meters: Math.round(distance_m * 10) / 10,
        duration_seconds: Math.round(duration_s * 10) / 10,
        direction,
        geometry,
      });
    }
  }
  return steps;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const db = drizzle(neon(url));
  const rows = await db.select().from(activities);
  console.log(`Warming routes for ${rows.length} activities...`);

  let cached = 0;
  let fetched = 0;
  let errors = 0;
  let skipped = 0;

  for (const a of rows) {
    if (SKIP.has(a.mode)) {
      skipped++;
      continue;
    }
    const profile = MODE_TO_PROFILE[a.mode] ?? "driving";
    const key = makeRouteCacheKey(a.startLat, a.startLon, a.endLat, a.endLon, profile);
    const existing = await db.select().from(routeCache).where(eq(routeCache.key, key)).limit(1);
    if (existing.length) {
      cached++;
      continue;
    }

    const osrmUrl =
      `${OSRM_BASE}/${profile}/${a.startLon},${a.startLat};${a.endLon},${a.endLat}` +
      `?overview=full&geometries=geojson&steps=true&annotations=duration,distance`;

    try {
      const resp = await fetch(osrmUrl);
      await sleep(1100);
      if (!resp.ok) {
        errors++;
        continue;
      }
      const data = (await resp.json()) as {
        code?: string;
        routes?: Array<{ geometry: { coordinates: number[][] }; legs: Array<{ steps?: unknown[] }> }>;
      };
      if (data.code !== "Ok" || !data.routes?.length) {
        errors++;
        continue;
      }
      const route = data.routes[0];
      const geometry = route.geometry.coordinates.map((c) => [c[1], c[0]] as [number, number]);
      const steps = parseSteps(route.legs ?? []);
      await db
        .insert(routeCache)
        .values({ key, geometry, steps })
        .onConflictDoUpdate({ target: routeCache.key, set: { geometry, steps } });
      fetched++;
      if (fetched % 25 === 0) console.log(`  fetched ${fetched}, cached hits ${cached}, errors ${errors}`);
    } catch {
      errors++;
      await sleep(1100);
    }
  }

  console.log({ cached, fetched, errors, skipped });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
