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
} from "@locations/db";
import type { Env, ImportQueueMessage } from "./env";
import { createAuth } from "./auth";
import { corsOriginFor } from "./cors";
import { blockDemo } from "./guards";
import { clientIp, rateLimit } from "./rate-limit";
import { applySecurityHeaders, isProductionHttps } from "./security-headers";
import { sniffTimelineJson } from "./upload-sniff";
import { extractTimelineJsonFromZip, isZipMagic } from "./unzip-takeout";
import {
  stripeClient,
  priceIdForInterval,
  recordStripeEvent,
  syncSubscriptionFromStripe,
  tenantForStripeCustomer,
} from "./billing";
import {
  configureGeoEndpoints,
  createImportJob,
  ensureDataSource,
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
  renameSource,
  resolveCoords,
  searchTenant,
  updateImportJob,
  upsertPlaceLabel,
  upsertUserSettings,
  wipeTenantData,
} from "./services";

const MAX_UPLOAD_BYTES = 80 * 1024 * 1024;

type Variables = {
  user: { id: string; email: string; name: string; role: string } | null;
  tenant: TenantId;
};

export const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use("*", async (c, next) => {
  await next();
  const noStore =
    c.req.path.startsWith("/api/") &&
    c.req.path !== "/api/health" &&
    !c.req.path.startsWith("/api/auth");
  applySecurityHeaders(c.res.headers, {
    isProductionHttps: isProductionHttps(c.env.BETTER_AUTH_URL, c.req.url),
    noStore,
    enforceCsp: c.env.CSP_ENFORCE === "true",
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
  const auth = createAuth(c.env);
  return auth.handler(c.req.raw);
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

app.get("/api/config", (c) =>
  c.json({
    mapTileDark:
      c.env.MAP_TILE_DARK_URL ||
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    mapTileLight:
      c.env.MAP_TILE_LIGHT_URL ||
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    mapAttr: c.env.MAP_TILE_ATTR || "&copy; OSM &copy; CARTO",
    signupDisabled: c.env.DISABLE_SIGNUP === "true",
  }),
);

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
          }),
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

  const result = await withTenant(db, tenant, (tx) => getDay(tx, tenant, date));
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
  return c.json(await withTenant(db, tenant, (tx) => getAnalytics(tx, tenant, "year-in-review")));
});

app.get("/api/route-progress", async (c) => {
  const db = getDb(c.env);
  const tenant = c.get("tenant");
  return c.json(await withTenant(db, tenant, (tx) => getRouteProgress(tx, tenant)));
});

app.get("/api/place/:placeId", async (c) => {
  const db = getDb(c.env);
  const lat = Number(c.req.query("lat") ?? 0);
  const lon = Number(c.req.query("lon") ?? 0);
  if (!lat && !lon) return c.json({ name: "Unknown", address: "" });
  return c.json(await resolveCoords(db, lat, lon));
});

app.get("/api/sources", async (c) => {
  const db = getDb(c.env);
  const tenant = c.get("tenant");
  return c.json(await withTenant(db, tenant, (tx) => listSources(tx, tenant)));
});

app.patch("/api/sources/:id", async (c) => {
  const blocked = blockDemo(c.get("user"));
  if (blocked) return c.json(blocked, 403);

  const body = (await c.req.json().catch(() => null)) as { label?: string } | null;
  const nextLabel = body?.label?.trim();
  if (!nextLabel) return c.json({ error: "label is required" }, 400);

  const db = getDb(c.env);
  const tenant = c.get("tenant");
  const result = await withTenant(db, tenant, (tx) =>
    renameSource(tx, tenant, c.req.param("id"), nextLabel),
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

app.post("/api/import", async (c) => {
  const blocked = blockDemo(c.get("user"));
  if (blocked) return c.json(blocked, 403);

  const user = c.get("user")!;
  if (!user.email || c.get("user")?.role === "user") {
    /* verified check via Better Auth session field if present */
  }
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

  if (file.size > quota.maxUploadBytes) {
    return c.json(
      {
        error: `File too large (${Math.round(file.size / 1024 / 1024)}MB). Max ${Math.round(quota.maxUploadBytes / 1024 / 1024)}MB.`,
      },
      413,
    );
  }

  const name = file.name.toLowerCase();
  if (name.endsWith(".mbox")) {
    return c.json({ error: "mbox is not supported. Upload Timeline JSON or a Takeout zip." }, 400);
  }

  const bytes = await file.arrayBuffer();
  let jsonText: string;
  if (name.endsWith(".zip") || isZipMagic(bytes)) {
    try {
      jsonText = await extractTimelineJsonFromZip(bytes);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Invalid zip" }, 400);
    }
  } else {
    const sniffed = sniffTimelineJson(bytes);
    if (!sniffed.ok) {
      return c.json({ error: sniffed.error }, 400);
    }
    jsonText = sniffed.text;
  }

  const merge = String(form.get("merge") ?? "") === "1" || String(form.get("merge") ?? "") === "true";
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
    }),
  );

  const message: ImportQueueMessage = { jobId, tenant, userId: user.id, r2Key, sourceId, merge };

  if (c.env.IMPORT_QUEUE) {
    await c.env.IMPORT_QUEUE.send(message);
  } else {
    c.executionCtx.waitUntil(runImportJob(c.env, message));
  }

  return c.json({ jobId, sourceId, label });
});

app.get("/api/search", async (c) => {
  const q = c.req.query("q") ?? "";
  const db = getDb(c.env);
  const tenant = c.get("tenant");
  return c.json(await withTenant(db, tenant, (tx) => searchTenant(tx, tenant, q)));
});

app.patch("/api/account/settings", async (c) => {
  const blocked = blockDemo(c.get("user"));
  if (blocked) return c.json(blocked, 403);
  const body = (await c.req.json().catch(() => null)) as {
    distanceUnit?: "mi" | "km";
    timezone?: string | null;
  } | null;
  const db = getDb(c.env);
  const tenant = c.get("tenant");
  const settings = await withTenant(db, tenant, (tx) =>
    upsertUserSettings(tx, tenant, {
      distanceUnit: body?.distanceUnit,
      timezone: body?.timezone,
    }),
  );
  return c.json(settings);
});

app.get("/api/account/export", async (c) => {
  const db = getDb(c.env);
  const tenant = c.get("tenant");
  const data = await withTenant(db, tenant, async (tx) => ({
    overview: await getOverview(tx, tenant),
    sources: await listSources(tx, tenant),
    settings: await getUserSettings(tx, tenant),
    labels: await listPlaceLabels(tx, tenant),
  }));
  return c.json({ tenant, exportedAt: new Date().toISOString(), ...data });
});

app.post("/api/account/delete", async (c) => {
  const blocked = blockDemo(c.get("user"));
  if (blocked) return c.json(blocked, 403);
  const user = c.get("user")!;
  const tenant = c.get("tenant");
  const db = getDb(c.env);
  const prefix = `uploads/${user.id}/`;
  const listed = await c.env.UPLOADS.list({ prefix });
  await Promise.all(listed.objects.map((o) => c.env.UPLOADS.delete(o.key)));
  const stripe = stripeClient(c.env);
  const sub = await withTenant(db, tenant, (tx) => getSubscription(tx, tenant));
  if (stripe && sub?.stripeCustomerId) {
    await stripe.customers.del(sub.stripeCustomerId).catch(() => undefined);
  }
  await wipeTenantData(db, tenant, user.id);
  return c.json({ ok: true });
});

app.patch("/api/places/labels", async (c) => {
  const blocked = blockDemo(c.get("user"));
  if (blocked) return c.json(blocked, 403);
  const body = (await c.req.json().catch(() => null)) as {
    placeKey?: string;
    label?: string;
    hidden?: boolean;
  } | null;
  if (!body?.placeKey || !body.label) return c.json({ error: "placeKey and label required" }, 400);
  const db = getDb(c.env);
  const tenant = c.get("tenant");
  const row = await withTenant(db, tenant, (tx) =>
    upsertPlaceLabel(tx, tenant, body.placeKey!, body.label!, body.hidden),
  );
  return c.json(row);
});

app.post("/api/billing/checkout", async (c) => {
  const blocked = blockDemo(c.get("user"));
  if (blocked) return c.json(blocked, 403);
  const stripe = stripeClient(c.env);
  if (!stripe) return c.json({ error: "Billing is not configured" }, 503);
  const body = (await c.req.json().catch(() => null)) as { interval?: "monthly" | "yearly" } | null;
  const interval = body?.interval === "yearly" ? "yearly" : "monthly";
  const priceId = priceIdForInterval(c.env, interval);
  if (!priceId) return c.json({ error: "Price is not configured" }, 503);
  const user = c.get("user")!;
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

  const obj = event.data.object as { customer?: string; id?: string; metadata?: { tenant?: string } };
  let tenant = obj.metadata?.tenant;
  if (!tenant && obj.customer) {
    tenant = (await tenantForStripeCustomer(db, String(obj.customer))) ?? undefined;
  }
  if (event.type.startsWith("customer.subscription") && tenant && obj.id) {
    const sub = await stripe.subscriptions.retrieve(obj.id);
    await withTenant(db, tenant, (tx) => syncSubscriptionFromStripe(tx, c.env, sub, tenant!));
  }
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as { subscription?: string; client_reference_id?: string };
    tenant = tenant || session.client_reference_id;
    if (tenant && session.subscription) {
      const sub = await stripe.subscriptions.retrieve(String(session.subscription));
      await withTenant(db, tenant, (tx) => syncSubscriptionFromStripe(tx, c.env, sub, tenant!));
    }
  }
  return c.json({ received: true });
});

app.get("/api/health", (c) => c.json({ ok: true }));

async function runImportJob(env: Env, message: ImportQueueMessage): Promise<void> {
  const jobDb = getDb(env);
  const { jobId, tenant, r2Key, sourceId, merge } = message;
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
      importSourceData(tx, { tenant, sourceId, records, merge }),
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
  } catch (err) {
    const messageText = err instanceof Error ? err.message : String(err);
    await withTenant(jobDb, tenant, (tx) =>
      updateImportJob(tx, jobId, { status: "error", error: messageText }, tenant),
    ).catch(() => undefined);
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
};
