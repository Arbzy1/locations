import { Hono } from "hono";
import { cors } from "hono/cors";
import { stream } from "hono/streaming";
import {
  tenantForUser,
  withTenant,
  isEntitled,
  isStaffRole,
  quotaForEntitled,
  type TenantId,
  type PlaceColorToken,
} from "@locations/db";
import { googleAuthEnabled, type Env, type ImportQueueMessage } from "./env";
import { createAuth } from "./auth";
import { corsOriginFor } from "./cors";
import { blockDemo } from "./guards";
import { clientIp, rateLimit } from "./rate-limit";
import { applySecurityHeaders, isProductionHttps } from "./security-headers";
import { registerAdminRoutes } from "./admin";
import { resolveOpsFlags } from "./ops-flags";
import {
  cspSourcesForHosts,
  extraCspHostsFromEnv,
  parseCustomTileHosts,
  sanitizeBookmarks,
  validateTileTemplate,
} from "./map-tiles";
import { sniffTimelineJson } from "./upload-sniff";
import { extractTimelineJsonFromZip, isZipMagic } from "./unzip-takeout";
import { deleteR2Prefix } from "./r2-prefix";
import {
  stripeClient,
  priceIdForInterval,
  recordStripeEvent,
  syncSubscriptionFromStripe,
} from "./billing";
import {
  configureGeoEndpoints,
  createImportJob,
  ensureDataSource,
  getActiveImportJob,
  getAnalytics,
  getDay,
  getDays,
  getDb,
  getHeatmap,
  getImportStatus,
  getOverview,
  getRouteProgress,
  getSourceById,
  getSubscription,
  getUserSettings,
  importSourceData,
  listPlaceLabels,
  listSources,
  removeSource,
  resolveCoords,
  searchTenant,
  updateImportJob,
  upsertPlaceLabel,
  upsertUserSettings,
  wipeTenantData,
  emailForTenant,
  getImportJob,
  getAccountExportPayload,
  createExportJob,
  getExportJob,
  getActiveExportJob,
  updateExportJob,
  listClusters,
  getCluster,
  listClusterVisits,
  getCorridorDetail,
  getTripRange,
  listNamedTrips,
  upsertNamedTrip,
  deleteNamedTrip,
  listChapters,
  upsertChapter,
  deleteChapter,
  listImportJobs,
  patchSource,
  previewImport,
  deleteTenantDateRange,
  rewarmRoutes,
  pingDatabase,
} from "./services";
import { billingEmailKind, sendProductEmail } from "./email";
import { parsePlaceColor, sanitizePlaceTags } from "./place-labels";
import { runMonthlyRecaps } from "./monthly-recap";
import { runExportPackJob } from "./export-pack-job";
import { publicExportJob } from "./export-pack";

type Variables = {
  user: { id: string; email: string; name: string; role: string } | null;
  tenant: TenantId;
};

export const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use("*", async (c, next) => {
  await next();
  const noStore = c.req.path.startsWith("/api/") && c.req.path !== "/api/health";
  applySecurityHeaders(c.res.headers, {
    isProductionHttps: isProductionHttps(c.env.BETTER_AUTH_URL, c.req.url),
    noStore,
    enforceCsp: c.env.CSP_ENFORCE === "true",
    extraCspSources: cspSourcesForHosts(extraCspHostsFromEnv(c.env)),
  });
});

app.use(
  "*",
  cors({
    origin: (origin, c) => corsOriginFor(c.env, origin) ?? undefined,
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  }),
);

app.post("/api/auth/demo", async (c) => {
  const ip = clientIp(c.req.raw.headers);
  const limited = rateLimit({ key: `demo:${ip}`, limit: 10, windowMs: 60_000 });
  if (!limited.ok) {
    c.header("Retry-After", String(limited.retryAfterSec));
    return c.json({ error: "Too many demo requests" }, 429);
  }
  const email = c.env.DEMO_EMAIL || "demo@locations.app";
  const password = c.env.DEMO_PASSWORD;
  if (!password) {
    return c.json({ error: "Demo is not configured" }, 503);
  }
  const auth = createAuth(c.env);
  return auth.api.signInEmail({
    body: { email, password },
    headers: c.req.raw.headers,
    asResponse: true,
  });
});

app.all("/api/auth/*", async (c) => {
  const ip = clientIp(c.req.raw.headers);
  const limited = rateLimit({
    key: `auth:${ip}`,
    limit: 30,
    windowMs: 60_000,
  });
  if (!limited.ok) {
    c.header("Retry-After", String(limited.retryAfterSec));
    return c.json({ error: "Too many auth requests" }, 429);
  }
  const flags = await resolveOpsFlags(c.env);
  const auth = createAuth(c.env, { disableSignUp: flags.signupDisabled });
  const res = await auth.handler(c.req.raw);
  if (res.ok && c.req.method === "POST" && c.req.path.endsWith("/change-password")) {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    const email = session?.user?.email;
    const role = (session?.user as { role?: string } | undefined)?.role;
    if (email) {
      c.executionCtx.waitUntil(
        sendProductEmail(c.env, { kind: "password_changed", to: email, role }),
      );
    }
  }
  if (res.ok && c.req.method === "POST" && c.req.path.endsWith("/change-email")) {
    try {
      await auth.api.revokeOtherSessions({ headers: c.req.raw.headers });
    } catch {
      /* ignore */
    }
  }
  return res;
});

app.use("/api/*", async (c, next) => {
  if (
    c.req.path.startsWith("/api/auth") ||
    c.req.path === "/api/health" ||
    c.req.path === "/api/config" ||
    c.req.path === "/api/billing/webhook"
  ) {
    return next();
  }
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const role = ((session.user as { role?: string }).role ?? "user") as string;
  const user = {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role,
  };
  c.set("user", user);
  c.set("tenant", tenantForUser(user));
  configureGeoEndpoints(c.env);
  return next();
});

async function rejectIfLimited(
  c: { header: (name: string, value: string) => void; json: (body: unknown, status: 429) => Response },
  key: string,
  limit: number,
  windowMs: number,
) {
  const limited = rateLimit({ key, limit, windowMs });
  if (limited.ok) return null;
  c.header("Retry-After", String(limited.retryAfterSec));
  return c.json({ error: "Too many requests. Try again later." }, 429);
}

function isErrorResult(value: unknown): value is { error: string } {
  return typeof value === "object" && value !== null && "error" in value;
}

function isUploadFile(value: unknown): value is File {
  return (
    !!value &&
    typeof value === "object" &&
    "arrayBuffer" in value &&
    "size" in value &&
    "name" in value &&
    typeof (value as File).arrayBuffer === "function"
  );
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseSourceIds(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return ids.length ? ids : undefined;
}

function zipBasename(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || path;
}

type TimelineUpload = {
  jsonText: string;
  chosenPath: string | null;
  candidates: string[];
};

async function readTimelineUpload(
  file: File,
  maxBytes: number,
): Promise<{ ok: true; value: TimelineUpload } | { ok: false; error: string; status: 400 | 413 }> {
  if (file.size > maxBytes) {
    return {
      ok: false,
      status: 413,
      error: `File too large (${Math.round(file.size / 1024 / 1024)}MB). Max ${Math.round(maxBytes / 1024 / 1024)}MB.`,
    };
  }
  const name = file.name.toLowerCase();
  if (name.endsWith(".mbox")) {
    return { ok: false, status: 400, error: "mbox is not supported. Upload Timeline JSON or a Takeout zip." };
  }
  const bytes = await file.arrayBuffer();
  if (name.endsWith(".zip") || isZipMagic(bytes)) {
    try {
      const extracted = await extractTimelineJsonFromZip(bytes);
      const sniffed = sniffTimelineJson(new TextEncoder().encode(extracted.text));
      if (!sniffed.ok) {
        return { ok: false, status: 400, error: sniffed.error };
      }
      return {
        ok: true,
        value: {
          jsonText: sniffed.text,
          chosenPath: extracted.chosenPath,
          candidates: extracted.candidates,
        },
      };
    } catch (err) {
      return { ok: false, status: 400, error: err instanceof Error ? err.message : "Invalid zip" };
    }
  }
  const sniffed = sniffTimelineJson(bytes);
  if (!sniffed.ok) {
    return { ok: false, status: 400, error: sniffed.error };
  }
  return {
    ok: true,
    value: { jsonText: sniffed.text, chosenPath: file.name || null, candidates: [file.name].filter(Boolean) },
  };
}

app.get("/api/config", async (c) => {
  const customTileHosts = parseCustomTileHosts(c.env.MAP_CUSTOM_TILE_HOSTS);
  const flags = await resolveOpsFlags(c.env);
  return c.json({
    mapTileDark:
      c.env.MAP_TILE_DARK_URL ||
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    mapTileLight:
      c.env.MAP_TILE_LIGHT_URL ||
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    mapAttr: c.env.MAP_TILE_ATTR || "&copy; OSM &copy; CARTO",
    mapStyleDark: c.env.MAP_STYLE_DARK_URL || null,
    mapStyleLight: c.env.MAP_STYLE_LIGHT_URL || null,
    customTiles: customTileHosts.length > 0,
    customTileHosts,
    signupDisabled: flags.signupDisabled,
    googleAuth: googleAuthEnabled(c.env),
    globe: flags.globeEnabled,
    billingConfigured: Boolean(c.env.STRIPE_SECRET_KEY),
    flags: {
      globe: flags.globeEnabled,
      demoTour: flags.demoTour,
      landing: flags.landingEnabled,
    },
  });
});

app.get("/api/me", async (c) => {
  const db = getDb(c.env);
  const tenant = c.get("tenant");
  const user = c.get("user");
  const [sub, settings] = await withTenant(db, tenant, async (tx) => [
    await getSubscription(tx, tenant),
    await getUserSettings(tx, tenant),
  ]);
  const entitled =
    isEntitled(sub, { isDemo: user?.role === "demo" }) || isStaffRole(user?.role);
  return c.json({
    user,
    tenant,
    entitlements: {
      entitled,
      status: sub?.status ?? "none",
      graceUntil: sub?.graceUntil ?? null,
    },
    settings,
  });
});

app.get("/api/overview", async (c) => {
  const db = getDb(c.env);
  const tenant = c.get("tenant");
  return c.json(await withTenant(db, tenant, (tx) => getOverview(tx, tenant)));
});

app.get("/api/days", async (c) => {
  const db = getDb(c.env);
  const tenant = c.get("tenant");
  return c.json(await withTenant(db, tenant, (tx) => getDays(tx, tenant)));
});

app.get("/api/day/:date", async (c) => {
  const db = getDb(c.env);
  const date = c.req.param("date");
  const tenant = c.get("tenant");
  const sourceIds = parseSourceIds(c.req.query("sources"));

  if (c.req.query("stream") === "1") {
    c.header("Content-Type", "application/x-ndjson; charset=utf-8");
    c.header("Cache-Control", "no-cache");
    return stream(c, async (out) => {
      const write = async (payload: unknown) => {
        await out.write(`${JSON.stringify(payload)}\n`);
      };
      try {
        const result = await withTenant(db, tenant, (tx) =>
          getDay(tx, tenant, date, async (progress) => {
            await write({ type: "progress", ...progress });
          }, sourceIds),
        );
        if ("error" in result) {
          await write({ type: "error", error: result.error });
        } else {
          await write({ type: "result", data: result });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await write({ type: "error", error: message });
      }
    });
  }

  const result = await withTenant(db, tenant, (tx) => getDay(tx, tenant, date, undefined, sourceIds));
  if ("error" in result) return c.json(result, 404);
  return c.json(result);
});

app.delete("/api/days", async (c) => {
  const blocked = blockDemo(c.get("user"));
  if (blocked) return c.json(blocked, 403);

  const from = (c.req.query("from") ?? "").trim();
  const to = (c.req.query("to") ?? "").trim();
  const sourceId = (c.req.query("sourceId") ?? "").trim() || undefined;
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to) || from > to) {
    return c.json({ error: "from and to must be YYYY-MM-DD with from <= to" }, 400);
  }

  const db = getDb(c.env);
  const tenant = c.get("tenant");
  const result = await withTenant(db, tenant, (tx) =>
    deleteTenantDateRange(tx, tenant, { from, to, sourceId }),
  );
  if ("error" in result) return c.json(result, 404);
  return c.json(result);
});

app.get("/api/heatmap", async (c) => {
  const db = getDb(c.env);
  const tenant = c.get("tenant");
  const sources = c.req.query("sources");
  return c.json(
    await withTenant(db, tenant, (tx) =>
      getHeatmap(tx, tenant, {
        sourceIds: sources ? sources.split(",").filter(Boolean) : undefined,
        from: c.req.query("from") || undefined,
        to: c.req.query("to") || undefined,
      }),
    ),
  );
});

app.get("/api/analytics/monthly", async (c) => {
  const db = getDb(c.env);
  const tenant = c.get("tenant");
  return c.json(await withTenant(db, tenant, (tx) => getAnalytics(tx, tenant, "monthly")));
});

app.get("/api/analytics/yearly", async (c) => {
  const db = getDb(c.env);
  const tenant = c.get("tenant");
  return c.json(await withTenant(db, tenant, (tx) => getAnalytics(tx, tenant, "yearly")));
});

app.get("/api/analytics/day-trips", async (c) => {
  const db = getDb(c.env);
  const tenant = c.get("tenant");
  return c.json(await withTenant(db, tenant, (tx) => getAnalytics(tx, tenant, "day-trips")));
});

app.get("/api/analytics/corridors", async (c) => {
  const db = getDb(c.env);
  const tenant = c.get("tenant");
  return c.json(await withTenant(db, tenant, (tx) => getAnalytics(tx, tenant, "corridors")));
});

app.get("/api/analytics/facts", async (c) => {
  const db = getDb(c.env);
  const tenant = c.get("tenant");
  return c.json(await withTenant(db, tenant, (tx) => getAnalytics(tx, tenant, "facts")));
});

app.get("/api/analytics/multi-day", async (c) => {
  const db = getDb(c.env);
  const tenant = c.get("tenant");
  return c.json(await withTenant(db, tenant, (tx) => getAnalytics(tx, tenant, "multi-day")));
});

app.get("/api/analytics/home-work", async (c) => {
  const db = getDb(c.env);
  const tenant = c.get("tenant");
  return c.json(await withTenant(db, tenant, (tx) => getAnalytics(tx, tenant, "home-work")));
});

app.get("/api/analytics/areas", async (c) => {
  const db = getDb(c.env);
  const tenant = c.get("tenant");
  return c.json(await withTenant(db, tenant, (tx) => getAnalytics(tx, tenant, "areas")));
});

app.get("/api/analytics/year-in-review", async (c) => {
  const db = getDb(c.env);
  const tenant = c.get("tenant");
  const yearRaw = c.req.query("year");
  const year = yearRaw ? Number(yearRaw) : undefined;
  if (year && Number.isFinite(year)) {
    const keyed = await withTenant(db, tenant, (tx) => getAnalytics(tx, tenant, `year-in-review:${year}`));
    if (keyed && !Array.isArray(keyed)) return c.json(keyed);
    const yearly = (await withTenant(db, tenant, (tx) => getAnalytics(tx, tenant, "yearly"))) as {
      year: number;
      distance_miles: number;
      visits: number;
      activities: number;
      days_tracked: number;
      modes: Record<string, number>;
    }[];
    const monthly = (await withTenant(db, tenant, (tx) => getAnalytics(tx, tenant, "monthly"))) as {
      month: string;
      top_places: [string, number][];
    }[];
    const y = Array.isArray(yearly) ? yearly.find((row) => row.year === year) : undefined;
    if (!y) return c.json(null);
    const places = new Map<string, number>();
    for (const m of Array.isArray(monthly) ? monthly : []) {
      if (!m.month.startsWith(String(year))) continue;
      for (const [name, n] of m.top_places ?? []) places.set(name, (places.get(name) ?? 0) + n);
    }
    return c.json({
      ...y,
      top_places: [...places.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
    });
  }
  return c.json(await withTenant(db, tenant, (tx) => getAnalytics(tx, tenant, "year-in-review")));
});

app.get("/api/analytics/flights", async (c) => {
  const db = getDb(c.env);
  const tenant = c.get("tenant");
  return c.json(await withTenant(db, tenant, (tx) => getAnalytics(tx, tenant, "flights")));
});

app.get("/api/analytics/train-hops", async (c) => {
  const db = getDb(c.env);
  const tenant = c.get("tenant");
  return c.json(await withTenant(db, tenant, (tx) => getAnalytics(tx, tenant, "train-hops")));
});

app.get("/api/analytics/low-movement", async (c) => {
  const db = getDb(c.env);
  const tenant = c.get("tenant");
  return c.json(await withTenant(db, tenant, (tx) => getAnalytics(tx, tenant, "low-movement")));
});

app.get("/api/route-progress", async (c) => {
  const db = getDb(c.env);
  const tenant = c.get("tenant");
  return c.json(await withTenant(db, tenant, (tx) => getRouteProgress(tx, tenant)));
});

app.post("/api/routes/rewarm", async (c) => {
  const blocked = blockDemo(c.get("user"));
  if (blocked) return c.json(blocked, 403);
  const db = getDb(c.env);
  const tenant = c.get("tenant");
  return c.json(await withTenant(db, tenant, (tx) => rewarmRoutes(tx, tenant)));
});

app.get("/api/place/:placeId", async (c) => {
  const user = c.get("user")!;
  const ip = clientIp(c.req.raw.headers);
  const limited = await rejectIfLimited(c, `place:${user.id}:${ip}`, 30, 60_000);
  if (limited) return limited;
  const db = getDb(c.env);
  const lat = Number(c.req.query("lat") ?? 0);
  const lon = Number(c.req.query("lon") ?? 0);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180 ||
    (!lat && !lon)
  ) {
    return c.json({ name: "Unknown", address: "" });
  }
  const qLat = Math.round(lat * 1e5) / 1e5;
  const qLon = Math.round(lon * 1e5) / 1e5;
  return c.json(await resolveCoords(db, qLat, qLon));
});

app.get("/api/sources", async (c) => {
  const db = getDb(c.env);
  const tenant = c.get("tenant");
  return c.json(await withTenant(db, tenant, (tx) => listSources(tx, tenant)));
});

app.patch("/api/sources/:id", async (c) => {
  const blocked = blockDemo(c.get("user"));
  if (blocked) return c.json(blocked, 403);

  const body = (await c.req.json().catch(() => null)) as { label?: string; color?: unknown } | null;
  const hasLabel = typeof body?.label === "string";
  const hasColor = body !== null && typeof body === "object" && "color" in body;
  if (!hasLabel && !hasColor) return c.json({ error: "label or color is required" }, 400);

  let color: PlaceColorToken | null | undefined;
  if (hasColor) {
    const parsed = parsePlaceColor(body.color);
    if (!parsed.ok) return c.json({ error: "Invalid color" }, 400);
    color = parsed.value;
  }

  const db = getDb(c.env);
  const tenant = c.get("tenant");
  const result = await withTenant(db, tenant, (tx) =>
    patchSource(tx, tenant, c.req.param("id"), {
      label: hasLabel ? body.label : undefined,
      color,
    }),
  );
  if ("error" in result) {
    const status = result.error === "Source not found" ? 404 : 400;
    return c.json(result, status);
  }
  return c.json(result);
});

app.delete("/api/sources/:id", async (c) => {
  const blocked = blockDemo(c.get("user"));
  if (blocked) return c.json(blocked, 403);

  const db = getDb(c.env);
  const tenant = c.get("tenant");
  const result = await withTenant(db, tenant, (tx) => removeSource(tx, tenant, c.req.param("id")));
  if ("error" in result) return c.json(result, 404);
  return c.json(result);
});

app.get("/api/import/status", async (c) => {
  const db = getDb(c.env);
  const tenant = c.get("tenant");
  return c.json(await withTenant(db, tenant, (tx) => getImportStatus(tx, tenant)));
});

app.post("/api/import/preview", async (c) => {
  const blocked = blockDemo(c.get("user"));
  if (blocked) return c.json(blocked, 403);

  const user = c.get("user")!;
  const tenant = c.get("tenant");
  const ip = clientIp(c.req.raw.headers);
  const limited = rateLimit({
    key: `import-preview:${user.id}:${ip}`,
    limit: 20,
    windowMs: 60 * 60_000,
  });
  if (!limited.ok) {
    c.header("Retry-After", String(limited.retryAfterSec));
    return c.json({ error: "Too many import requests. Try again later." }, 429);
  }

  const db = getDb(c.env);
  const sessionUser = c.get("user")!;
  const verified = Boolean(
    (await createAuth(c.env).api.getSession({ headers: c.req.raw.headers }))?.user
      ?.emailVerified ?? sessionUser.role === "demo",
  );
  if (!verified && sessionUser.role !== "demo") {
    return c.json({ error: "Verify your email before importing Timeline data" }, 403);
  }

  const sub = await withTenant(db, tenant, (tx) => getSubscription(tx, tenant));
  const entitled =
    isEntitled(sub, { isDemo: false }) || isStaffRole(sessionUser.role);
  if (c.env.STRIPE_SECRET_KEY && !entitled) {
    return c.json({ error: "An active subscription is required to import" }, 402);
  }
  const quota = quotaForEntitled(Boolean(c.env.STRIPE_SECRET_KEY) ? entitled : true);

  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return c.json({ error: "Expected multipart form data with a file" }, 400);
  }
  const file = form.get("file");
  if (!isUploadFile(file)) {
    return c.json({ error: "file is required (Timeline JSON or zip)" }, 400);
  }

  const uploaded = await readTimelineUpload(file, quota.maxUploadBytes);
  if (!uploaded.ok) return c.json({ error: uploaded.error }, uploaded.status);

  let records: unknown;
  try {
    records = JSON.parse(uploaded.value.jsonText);
  } catch {
    return c.json({ error: "Invalid JSON file" }, 400);
  }

  const sourceIdField = String(form.get("sourceId") ?? "").trim();
  let sourceId: string | undefined;
  if (sourceIdField) {
    const existing = await withTenant(db, tenant, (tx) => getSourceById(tx, tenant, sourceIdField));
    if (!existing) return c.json({ error: "Source not found" }, 404);
    sourceId = existing.id;
  }

  const chosenPath = uploaded.value.chosenPath
    ? zipBasename(uploaded.value.chosenPath)
    : null;

  try {
    const preview = await withTenant(db, tenant, async (tx) => {
      const settings = await getUserSettings(tx, tenant);
      return previewImport(tx, tenant, {
        records,
        sourceId,
        timezone: settings.timezone,
        chosenPath: uploaded.value.chosenPath,
        candidates: uploaded.value.candidates,
      });
    });
    return c.json(preview);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Could not preview file" }, 400);
  }
});

app.post("/api/import", async (c) => {
  const blocked = blockDemo(c.get("user"));
  if (blocked) return c.json(blocked, 403);

  const user = c.get("user")!;
  const tenant = c.get("tenant");
  const ip = clientIp(c.req.raw.headers);
  const limited = rateLimit({
    key: `import:${user.id}:${ip}`,
    limit: 5,
    windowMs: 60 * 60_000,
  });
  if (!limited.ok) {
    c.header("Retry-After", String(limited.retryAfterSec));
    return c.json({ error: "Too many import requests. Try again later." }, 429);
  }

  const db = getDb(c.env);
  const sessionUser = c.get("user")!;
  const verified = Boolean(
    (await createAuth(c.env).api.getSession({ headers: c.req.raw.headers }))?.user
      ?.emailVerified ?? sessionUser.role === "demo",
  );
  if (!verified && sessionUser.role !== "demo") {
    return c.json({ error: "Verify your email before importing Timeline data" }, 403);
  }

  const sub = await withTenant(db, tenant, (tx) => getSubscription(tx, tenant));
  const entitled =
    isEntitled(sub, { isDemo: false }) || isStaffRole(sessionUser.role);
  if (c.env.STRIPE_SECRET_KEY && !entitled) {
    return c.json({ error: "An active subscription is required to import" }, 402);
  }
  const quota = quotaForEntitled(Boolean(c.env.STRIPE_SECRET_KEY) ? entitled : true);

  const activeImport = await withTenant(db, tenant, (tx) => getActiveImportJob(tx, tenant));
  if (activeImport) {
    return c.json({ error: "An import is already running", jobId: activeImport.id }, 409);
  }

  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return c.json({ error: "Expected multipart form data with a file" }, 400);
  }

  const file = form.get("file");
  if (!isUploadFile(file)) {
    return c.json({ error: "file is required (Timeline JSON or zip)" }, 400);
  }

  const uploaded = await readTimelineUpload(file, quota.maxUploadBytes);
  if (!uploaded.ok) return c.json({ error: uploaded.error }, uploaded.status);
  const jsonText = uploaded.value.jsonText;
  const chosenFile = uploaded.value.chosenPath
    ? zipBasename(uploaded.value.chosenPath)
    : null;

  const merge = String(form.get("merge") ?? "") === "1" || String(form.get("merge") ?? "") === "true";
  const skipOverlappingDays =
    String(form.get("skipOverlappingDays") ?? "") === "1" ||
    String(form.get("skipOverlappingDays") ?? "") === "true";
  const sourceIdField = String(form.get("sourceId") ?? "").trim();
  const labelField = String(form.get("label") ?? "").trim();

  let sourceId: string;
  let label: string;

  const sources = await withTenant(db, tenant, (tx) => listSources(tx, tenant));
  if (!sourceIdField && sources.length >= quota.maxSources) {
    return c.json({ error: "Source limit reached for this plan" }, 403);
  }

  if (sourceIdField) {
    const existing = await withTenant(db, tenant, (tx) => getSourceById(tx, tenant, sourceIdField));
    if (!existing) return c.json({ error: "Source not found" }, 404);
    sourceId = existing.id;
    label = existing.label;
  } else {
    label = labelField || `Google account ${sources.length + 1}`;
    const source = await withTenant(db, tenant, (tx) => ensureDataSource(tx, { tenant, label }));
    sourceId = source.id;
  }

  const jobId = crypto.randomUUID();
  const r2Key = `uploads/${user.id}/${jobId}.json`;

  await c.env.UPLOADS.put(r2Key, jsonText, {
    httpMetadata: { contentType: "application/json" },
  });

  await withTenant(db, tenant, (tx) =>
    createImportJob(tx, {
      id: jobId,
      tenant,
      sourceId,
      userId: user.id,
      r2Key,
      status: "pending",
      merge,
      chosenFile,
    }),
  );

  const message: ImportQueueMessage = {
    jobId,
    tenant,
    userId: user.id,
    r2Key,
    sourceId,
    merge,
    skipOverlappingDays: merge && skipOverlappingDays,
  };

  if (c.env.IMPORT_QUEUE) {
    await c.env.IMPORT_QUEUE.send(message);
  } else {
    c.executionCtx.waitUntil(runImportJob(c.env, message));
  }

  return c.json({ jobId, sourceId, label, chosenFile });
});

app.get("/api/search", async (c) => {
  const user = c.get("user")!;
  const ip = clientIp(c.req.raw.headers);
  const limited = await rejectIfLimited(c, `search:${user.id}:${ip}`, 60, 60_000);
  if (limited) return limited;
  const q = c.req.query("q") ?? "";
  const db = getDb(c.env);
  const tenant = c.get("tenant");
  return c.json(await withTenant(db, tenant, (tx) => searchTenant(tx, tenant, q)));
});

app.get("/api/clusters", async (c) => {
  const db = getDb(c.env);
  const tenant = c.get("tenant");
  const limit = Number(c.req.query("limit") ?? 50);
  return c.json(
    await withTenant(db, tenant, (tx) =>
      listClusters(tx, tenant, {
        q: c.req.query("q") ?? undefined,
        sort: c.req.query("sort") ?? undefined,
        limit: Number.isFinite(limit) ? limit : 50,
        cursor: c.req.query("cursor") ?? undefined,
      }),
    ),
  );
});

app.get("/api/clusters/:key/visits", async (c) => {
  const db = getDb(c.env);
  const tenant = c.get("tenant");
  const key = decodeURIComponent(c.req.param("key"));
  return c.json(
    await withTenant(db, tenant, (tx) =>
      listClusterVisits(tx, tenant, key, {
        from: c.req.query("from") ?? undefined,
        to: c.req.query("to") ?? undefined,
        limit: Number(c.req.query("limit") ?? 40),
        cursor: c.req.query("cursor") ?? undefined,
      }),
    ),
  );
});

app.get("/api/clusters/:key", async (c) => {
  const db = getDb(c.env);
  const tenant = c.get("tenant");
  const key = decodeURIComponent(c.req.param("key"));
  const row = await withTenant(db, tenant, (tx) => getCluster(tx, tenant, key));
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

app.get("/api/corridors/:a/:b", async (c) => {
  const db = getDb(c.env);
  const tenant = c.get("tenant");
  const a = decodeURIComponent(c.req.param("a"));
  const b = decodeURIComponent(c.req.param("b"));
  const row = await withTenant(db, tenant, (tx) => getCorridorDetail(tx, tenant, a, b));
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

app.get("/api/trip-range/:start/:end", async (c) => {
  const db = getDb(c.env);
  const tenant = c.get("tenant");
  const result = await withTenant(db, tenant, (tx) =>
    getTripRange(tx, tenant, c.req.param("start"), c.req.param("end")),
  );
  if (isErrorResult(result)) {
    return c.json(result, 400);
  }
  return c.json(result);
});

app.get("/api/trips", async (c) => {
  const db = getDb(c.env);
  const tenant = c.get("tenant");
  return c.json(await withTenant(db, tenant, (tx) => listNamedTrips(tx, tenant)));
});

app.post("/api/trips", async (c) => {
  const blocked = blockDemo(c.get("user"));
  if (blocked) return c.json(blocked, 403);
  const body = (await c.req.json().catch(() => null)) as {
    name?: string;
    start?: string;
    end?: string;
    dates?: string[];
  } | null;
  const db = getDb(c.env);
  const tenant = c.get("tenant");
  const result = await withTenant(db, tenant, (tx) =>
    upsertNamedTrip(tx, tenant, {
      name: body?.name ?? "",
      start: body?.start ?? "",
      end: body?.end ?? "",
      dates: body?.dates,
    }),
  );
  if (isErrorResult(result)) {
    return c.json(result, result.error === "Not found" ? 404 : 400);
  }
  return c.json(result);
});

app.patch("/api/trips/:id", async (c) => {
  const blocked = blockDemo(c.get("user"));
  if (blocked) return c.json(blocked, 403);
  const body = (await c.req.json().catch(() => null)) as {
    name?: string;
    start?: string;
    end?: string;
    dates?: string[];
  } | null;
  const db = getDb(c.env);
  const tenant = c.get("tenant");
  const result = await withTenant(db, tenant, (tx) =>
    upsertNamedTrip(tx, tenant, {
      id: c.req.param("id"),
      name: body?.name ?? "",
      start: body?.start ?? "",
      end: body?.end ?? "",
      dates: body?.dates,
    }),
  );
  if (isErrorResult(result)) {
    return c.json(result, result.error === "Not found" ? 404 : 400);
  }
  return c.json(result);
});

app.delete("/api/trips/:id", async (c) => {
  const blocked = blockDemo(c.get("user"));
  if (blocked) return c.json(blocked, 403);
  const db = getDb(c.env);
  const tenant = c.get("tenant");
  const result = await withTenant(db, tenant, (tx) => deleteNamedTrip(tx, tenant, c.req.param("id")));
  if (isErrorResult(result)) return c.json(result, 404);
  return c.json(result);
});

app.get("/api/chapters", async (c) => {
  const db = getDb(c.env);
  const tenant = c.get("tenant");
  return c.json(await withTenant(db, tenant, (tx) => listChapters(tx, tenant)));
});

app.post("/api/chapters", async (c) => {
  const blocked = blockDemo(c.get("user"));
  if (blocked) return c.json(blocked, 403);
  const body = (await c.req.json().catch(() => null)) as {
    name?: string;
    start?: string;
    end?: string;
  } | null;
  const db = getDb(c.env);
  const tenant = c.get("tenant");
  const result = await withTenant(db, tenant, (tx) =>
    upsertChapter(tx, tenant, {
      name: body?.name ?? "",
      start: body?.start ?? "",
      end: body?.end ?? "",
    }),
  );
  if (isErrorResult(result)) {
    return c.json(result, result.error === "Not found" ? 404 : 400);
  }
  return c.json(result);
});

app.patch("/api/chapters/:id", async (c) => {
  const blocked = blockDemo(c.get("user"));
  if (blocked) return c.json(blocked, 403);
  const body = (await c.req.json().catch(() => null)) as {
    name?: string;
    start?: string;
    end?: string;
  } | null;
  const db = getDb(c.env);
  const tenant = c.get("tenant");
  const result = await withTenant(db, tenant, (tx) =>
    upsertChapter(tx, tenant, {
      id: c.req.param("id"),
      name: body?.name ?? "",
      start: body?.start ?? "",
      end: body?.end ?? "",
    }),
  );
  if (isErrorResult(result)) {
    return c.json(result, result.error === "Not found" ? 404 : 400);
  }
  return c.json(result);
});

app.delete("/api/chapters/:id", async (c) => {
  const blocked = blockDemo(c.get("user"));
  if (blocked) return c.json(blocked, 403);
  const db = getDb(c.env);
  const tenant = c.get("tenant");
  const result = await withTenant(db, tenant, (tx) => deleteChapter(tx, tenant, c.req.param("id")));
  if (isErrorResult(result)) return c.json(result, 404);
  return c.json(result);
});

app.get("/api/import/jobs", async (c) => {
  const db = getDb(c.env);
  const tenant = c.get("tenant");
  return c.json(await withTenant(db, tenant, (tx) => listImportJobs(tx, tenant)));
});

registerAdminRoutes(app);

for (const key of [
  "away-nights",
  "commute",
  "firsts",
  "data-health",
  "moving",
  "anomaly",
  "streaks",
  "place-deltas",
  "lapsed-places",
  "hour-of-week",
  "personality",
  "activity-guesses",
  "badges",
] as const) {
  app.get(`/api/analytics/${key}`, async (c) => {
    const db = getDb(c.env);
    const tenant = c.get("tenant");
    return c.json(await withTenant(db, tenant, (tx) => getAnalytics(tx, tenant, key)));
  });
}

app.patch("/api/account/settings", async (c) => {
  const blocked = blockDemo(c.get("user"));
  if (blocked) return c.json(blocked, 403);
  const body = (await c.req.json().catch(() => null)) as {
    distanceUnit?: "mi" | "km";
    timezone?: string | null;
    monthlyRecapEnabled?: boolean;
    mapBookmarks?: unknown;
    mapTileDarkUrl?: string | null;
    mapTileLightUrl?: string | null;
  } | null;
  const allowedHosts = parseCustomTileHosts(c.env.MAP_CUSTOM_TILE_HOSTS);
  if (body?.mapTileDarkUrl != null && body.mapTileDarkUrl !== "") {
    const check = validateTileTemplate(body.mapTileDarkUrl, allowedHosts);
    if (!check.ok) return c.json({ error: check.error }, 400);
  }
  if (body?.mapTileLightUrl != null && body.mapTileLightUrl !== "") {
    const check = validateTileTemplate(body.mapTileLightUrl, allowedHosts);
    if (!check.ok) return c.json({ error: check.error }, 400);
  }
  let mapBookmarks: ReturnType<typeof sanitizeBookmarks> | undefined;
  if (body?.mapBookmarks !== undefined) {
    mapBookmarks = sanitizeBookmarks(body.mapBookmarks);
    if (!Array.isArray(mapBookmarks)) return c.json({ error: mapBookmarks.error }, 400);
  }
  const db = getDb(c.env);
  const tenant = c.get("tenant");
  const settings = await withTenant(db, tenant, (tx) =>
    upsertUserSettings(tx, tenant, {
      distanceUnit: body?.distanceUnit,
      timezone: body?.timezone,
      monthlyRecapEnabled: body?.monthlyRecapEnabled,
      mapBookmarks: Array.isArray(mapBookmarks) ? mapBookmarks : undefined,
      mapTileDarkUrl: body?.mapTileDarkUrl,
      mapTileLightUrl: body?.mapTileLightUrl,
    }),
  );
  return c.json(settings);
});

app.get("/api/account/export", async (c) => {
  const db = getDb(c.env);
  const tenant = c.get("tenant");
  const data = await withTenant(db, tenant, (tx) => getAccountExportPayload(tx, tenant));
  const stamp = new Date().toISOString().slice(0, 10);
  c.header("Content-Disposition", `attachment; filename="locations-export-${stamp}.json"`);
  return c.json({ tenant, exportedAt: new Date().toISOString(), ...data });
});

app.post("/api/account/export-pack", async (c) => {
  const user = c.get("user")!;
  const tenant = c.get("tenant");
  const ip = clientIp(c.req.raw.headers);
  const limited = rateLimit({ key: `export-pack:${tenant}:${ip}`, limit: 3, windowMs: 10 * 60_000 });
  if (!limited.ok) {
    c.header("Retry-After", String(limited.retryAfterSec));
    return c.json({ error: "Too many export requests" }, 429);
  }
  const db = getDb(c.env);
  const active = await withTenant(db, tenant, (tx) => getActiveExportJob(tx, tenant));
  if (active) {
    return c.json({ error: "An export is already running", job: publicExportJob(active) }, 409);
  }
  const jobId = crypto.randomUUID();
  const r2Key = `exports/${user.id}/${jobId}.zip`;
  await withTenant(db, tenant, (tx) =>
    createExportJob(tx, { id: jobId, tenant, userId: user.id, r2Key, status: "pending" }),
  );
  c.executionCtx.waitUntil(runExportPackJob(c.env, { jobId, tenant, userId: user.id, r2Key }));
  return c.json({ jobId, status: "pending" });
});

app.get("/api/account/export-pack/:jobId/file", async (c) => {
  const db = getDb(c.env);
  const tenant = c.get("tenant");
  const jobId = c.req.param("jobId");
  const job = await withTenant(db, tenant, (tx) => getExportJob(tx, jobId, tenant));
  if (!job) return c.json({ error: "Not found" }, 404);
  if (job.status === "pending" || job.status === "processing") {
    return c.json({ error: "Pack is still building" }, 409);
  }
  if (job.status !== "ready" || !job.r2Key) {
    return c.json({ error: "Pack expired. Request a new download." }, 410);
  }
  const obj = await c.env.UPLOADS.get(job.r2Key);
  if (!obj) {
    return c.json({ error: "Pack expired. Request a new download." }, 410);
  }
  const bytes = await obj.arrayBuffer();
  try {
    await c.env.UPLOADS.delete(job.r2Key);
  } catch {
    /* ignore missing object */
  }
  await withTenant(db, tenant, (tx) =>
    updateExportJob(tx, jobId, tenant, { r2Key: null }),
  );
  const stamp = new Date().toISOString().slice(0, 10);
  c.header("Content-Type", "application/zip");
  c.header("Content-Disposition", `attachment; filename="locations-gdpr-pack-${stamp}.zip"`);
  return c.body(bytes);
});

app.get("/api/account/export-pack/:jobId", async (c) => {
  const db = getDb(c.env);
  const tenant = c.get("tenant");
  const jobId = c.req.param("jobId");
  const job = await withTenant(db, tenant, (tx) => getExportJob(tx, jobId, tenant));
  if (!job) return c.json({ error: "Not found" }, 404);
  return c.json(publicExportJob(job));
});

app.get("/api/places/labels", async (c) => {
  const db = getDb(c.env);
  const tenant = c.get("tenant");
  const labels = await withTenant(db, tenant, (tx) => listPlaceLabels(tx, tenant));
  return c.json(labels);
});

app.post("/api/account/delete", async (c) => {
  const blocked = blockDemo(c.get("user"));
  if (blocked) return c.json(blocked, 403);
  const user = c.get("user")!;
  const tenant = c.get("tenant");
  const db = getDb(c.env);
  const prefix = `uploads/${user.id}/`;
  await deleteR2Prefix(c.env.UPLOADS, prefix);
  await deleteR2Prefix(c.env.UPLOADS, `exports/${user.id}/`);
  const stripe = stripeClient(c.env);
  const sub = await withTenant(db, tenant, (tx) => getSubscription(tx, tenant));
  if (stripe && sub?.stripeCustomerId) {
    await stripe.customers.del(sub.stripeCustomerId).catch(() => undefined);
  }
  await sendProductEmail(c.env, {
    kind: "account_deleted",
    to: user.email,
    role: user.role,
  });
  await withTenant(db, tenant, (tx) => wipeTenantData(tx, tenant, user.id, user.email));
  return c.json({ ok: true });
});

app.patch("/api/places/labels", async (c) => {
  const blocked = blockDemo(c.get("user"));
  if (blocked) return c.json(blocked, 403);
  const body = (await c.req.json().catch(() => null)) as {
    placeKey?: string;
    label?: string;
    hidden?: boolean;
    favourite?: boolean;
    color?: unknown;
    tags?: unknown;
  } | null;
  if (!body) return c.json({ error: "placeKey required" }, 400);
  const placeKey = body.placeKey?.trim();
  if (!placeKey) return c.json({ error: "placeKey required" }, 400);
  if (
    body.label === undefined &&
    body.hidden === undefined &&
    body.favourite === undefined &&
    body.color === undefined &&
    body.tags === undefined
  ) {
    return c.json({ error: "No fields to update" }, 400);
  }
  let color: PlaceColorToken | null | undefined;
  if (body.color !== undefined) {
    const parsed = parsePlaceColor(body.color);
    if (!parsed.ok) return c.json({ error: "Invalid color" }, 400);
    color = parsed.value;
  }
  let tags: string[] | undefined;
  if (body.tags !== undefined) {
    const parsed = sanitizePlaceTags(body.tags);
    if (!parsed.ok) return c.json({ error: "Invalid tags" }, 400);
    tags = parsed.value;
  }
  const db = getDb(c.env);
  const tenant = c.get("tenant");
  const row = await withTenant(db, tenant, (tx) =>
    upsertPlaceLabel(tx, tenant, {
      placeKey,
      label: typeof body.label === "string" ? body.label : undefined,
      hidden: typeof body.hidden === "boolean" ? body.hidden : undefined,
      favourite: typeof body.favourite === "boolean" ? body.favourite : undefined,
      color,
      tags,
    }),
  );
  return c.json(row);
});

app.post("/api/billing/checkout", async (c) => {
  const blocked = blockDemo(c.get("user"));
  if (blocked) return c.json(blocked, 403);
  const user = c.get("user")!;
  const ip = clientIp(c.req.raw.headers);
  const limited = await rejectIfLimited(c, `checkout:${user.id}:${ip}`, 10, 60 * 60_000);
  if (limited) return limited;
  const stripe = stripeClient(c.env);
  if (!stripe) return c.json({ error: "Billing is not configured" }, 503);
  const body = (await c.req.json().catch(() => null)) as { interval?: "monthly" | "yearly" } | null;
  const interval = body?.interval === "yearly" ? "yearly" : "monthly";
  const priceId = priceIdForInterval(c.env, interval);
  if (!priceId) return c.json({ error: "Price is not configured" }, 503);
  const tenant = c.get("tenant");
  const db = getDb(c.env);
  const existing = await withTenant(db, tenant, (tx) => getSubscription(tx, tenant));
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: existing?.stripeCustomerId || undefined,
    customer_email: existing?.stripeCustomerId ? undefined : user.email,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${c.env.BETTER_AUTH_URL}/settings?billing=success`,
    cancel_url: `${c.env.BETTER_AUTH_URL}/settings?billing=cancel`,
    client_reference_id: tenant,
    metadata: { tenant },
    subscription_data: { metadata: { tenant } },
    automatic_tax: { enabled: true },
  });
  return c.json({ url: session.url });
});

app.post("/api/billing/portal", async (c) => {
  const blocked = blockDemo(c.get("user"));
  if (blocked) return c.json(blocked, 403);
  const user = c.get("user")!;
  const ip = clientIp(c.req.raw.headers);
  const limited = await rejectIfLimited(c, `portal:${user.id}:${ip}`, 10, 60 * 60_000);
  if (limited) return limited;
  const stripe = stripeClient(c.env);
  if (!stripe) return c.json({ error: "Billing is not configured" }, 503);
  const tenant = c.get("tenant");
  const db = getDb(c.env);
  const existing = await withTenant(db, tenant, (tx) => getSubscription(tx, tenant));
  if (!existing?.stripeCustomerId) return c.json({ error: "No billing account" }, 404);
  const portal = await stripe.billingPortal.sessions.create({
    customer: existing.stripeCustomerId,
    return_url: `${c.env.BETTER_AUTH_URL}/settings`,
  });
  return c.json({ url: portal.url });
});

app.post("/api/billing/webhook", async (c) => {
  const stripe = stripeClient(c.env);
  const secret = c.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return c.json({ error: "Billing is not configured" }, 503);
  const raw = await c.req.raw.text();
  const sig = c.req.header("stripe-signature");
  if (!sig) return c.json({ error: "Missing signature" }, 400);
  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig, secret);
  } catch {
    return c.json({ error: "Invalid signature" }, 400);
  }
  const db = getDb(c.env);
  const fresh = await recordStripeEvent(db, event.id, event.type);
  if (!fresh) return c.json({ received: true, duplicate: true });

  const obj = event.data.object as {
    customer?: string;
    id?: string;
    subscription?: string;
    metadata?: { tenant?: string };
    client_reference_id?: string;
  };
  let tenant = obj.metadata?.tenant || obj.client_reference_id;
  if (!tenant && event.type.startsWith("customer.subscription") && obj.id) {
    const sub = await stripe.subscriptions.retrieve(obj.id);
    tenant = sub.metadata?.tenant;
    if (tenant) {
      await withTenant(db, tenant, (tx) => syncSubscriptionFromStripe(tx, c.env, sub, tenant!));
      await sendBillingNotice(c.env, db, tenant, event.type, sub.status, event.id);
    }
    return c.json({ received: true });
  }
  if (event.type.startsWith("customer.subscription") && tenant && obj.id) {
    const sub = await stripe.subscriptions.retrieve(obj.id);
    await withTenant(db, tenant, (tx) => syncSubscriptionFromStripe(tx, c.env, sub, tenant!));
    await sendBillingNotice(c.env, db, tenant, event.type, sub?.status, event.id);
  }
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as { subscription?: string; client_reference_id?: string };
    tenant = tenant || session.client_reference_id;
    if (tenant && session.subscription) {
      const sub = await stripe.subscriptions.retrieve(String(session.subscription));
      await withTenant(db, tenant, (tx) => syncSubscriptionFromStripe(tx, c.env, sub, tenant!));
      await sendBillingNotice(c.env, db, tenant, event.type, sub?.status, event.id);
    }
  }
  return c.json({ received: true });
});

app.get("/api/health", async (c) => {
  const dbOk = await pingDatabase(c.env).catch(() => false);
  return c.json({ ok: true, worker: "ok", db: dbOk ? "ok" : "error" });
});

async function sendBillingNotice(
  env: Env,
  db: ReturnType<typeof getDb>,
  tenant: string,
  eventType: string,
  status: string | undefined,
  eventId: string,
): Promise<void> {
  const kind = billingEmailKind(eventType, status);
  if (!kind) return;
  const recipient = await emailForTenant(db, tenant);
  if (!recipient) return;
  await sendProductEmail(env, {
    kind,
    to: recipient.email,
    role: recipient.role,
    idempotencyKey: eventId,
  });
}

async function notifyImportJob(
  env: Env,
  db: ReturnType<typeof getDb>,
  tenant: string,
  jobId: string,
): Promise<void> {
  const job = await withTenant(db, tenant, (tx) => getImportJob(tx, jobId, tenant));
  if (!job || job.notifiedAt) return;
  if (job.status !== "ready" && job.status !== "error") return;
  const recipient = await emailForTenant(db, tenant);
  const kind = job.status === "ready" ? "import_ready" : "import_failed";
  const result = recipient
    ? await sendProductEmail(env, {
        kind,
        to: recipient.email,
        role: recipient.role,
        vars:
          job.status === "ready"
            ? { visitCount: job.visitCount ?? 0, activityCount: job.activityCount ?? 0 }
            : {},
        idempotencyKey: `import:${jobId}`,
      })
    : "skipped";
  if (result !== "failed") {
    await withTenant(db, tenant, (tx) =>
      updateImportJob(tx, jobId, { notifiedAt: new Date() }, tenant),
    );
  }
}

async function runImportJob(env: Env, message: ImportQueueMessage): Promise<void> {
  const jobDb = getDb(env);
  const { jobId, tenant, r2Key, sourceId, merge, skipOverlappingDays } = message;
  try {
    await withTenant(jobDb, tenant, (tx) =>
      updateImportJob(tx, jobId, { status: "processing" }, tenant),
    );
    const obj = await env.UPLOADS.get(r2Key);
    if (!obj) throw new Error("Uploaded file missing from storage");
    const text = await obj.text();
    let records: unknown;
    try {
      records = JSON.parse(text);
    } catch {
      throw new Error("Invalid JSON file");
    }
    const parsedCount = Array.isArray(records) ? records.length : 1;
    await withTenant(jobDb, tenant, (tx) =>
      updateImportJob(tx, jobId, { status: "processing", parsedCount }, tenant),
    );
    const result = await withTenant(jobDb, tenant, (tx) =>
      importSourceData(tx, { tenant, sourceId, records, merge, skipOverlappingDays }),
    );
    await withTenant(jobDb, tenant, (tx) =>
      updateImportJob(
        tx,
        jobId,
        {
          status: "ready",
          visitCount: result.visitCount,
          activityCount: result.activityCount,
          parsedCount,
        },
        tenant,
      ),
    );
    await notifyImportJob(env, jobDb, tenant, jobId);
  } catch (err) {
    const messageText = err instanceof Error ? err.message : String(err);
    await withTenant(jobDb, tenant, (tx) =>
      updateImportJob(tx, jobId, { status: "error", error: messageText }, tenant),
    ).catch(() => undefined);
    await notifyImportJob(env, jobDb, tenant, jobId).catch(() => undefined);
  } finally {
    await env.UPLOADS.delete(r2Key).catch(() => undefined);
  }
}

function withAssetSecurityHeaders(
  response: Response,
  env: Env,
  requestUrl: string,
): Response {
  const headers = new Headers(response.headers);
  applySecurityHeaders(headers, {
    isProductionHttps: isProductionHttps(env.BETTER_AUTH_URL, requestUrl),
    noStore: false,
    enforceCsp: env.CSP_ENFORCE === "true",
    extraCspSources: cspSourcesForHosts(extraCspHostsFromEnv(env)),
  });
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return app.fetch(request, env, ctx);
    }
    const asset = await env.ASSETS.fetch(request);
    return withAssetSecurityHeaders(asset, env, request.url);
  },
  async queue(batch: MessageBatch<ImportQueueMessage>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      await runImportJob(env, msg.body);
      msg.ack();
    }
  },
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await runMonthlyRecaps(env);
  },
};
