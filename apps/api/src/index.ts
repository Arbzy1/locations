import { Hono } from "hono";
import { cors } from "hono/cors";
import { stream } from "hono/streaming";
import { tenantForUser, type TenantId } from "@locations/db";
import type { Env } from "./env";
import { createAuth } from "./auth";
import { blockDemo } from "./guards";
import {
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
  importSourceData,
  listSources,
  removeSource,
  renameSource,
  resolveCoords,
  updateImportJob,
} from "./services";

const MAX_UPLOAD_BYTES = 80 * 1024 * 1024;

type Variables = {
  user: { id: string; email: string; name: string; role: string } | null;
  tenant: TenantId;
};

export const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use(
  "*",
  cors({
    origin: (origin) => origin || "*",
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  }),
);

app.all("/api/auth/*", async (c) => {
  const auth = createAuth(c.env);
  return auth.handler(c.req.raw);
});

app.use("/api/*", async (c, next) => {
  if (c.req.path.startsWith("/api/auth") || c.req.path === "/api/health") return next();
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

app.get("/api/me", (c) =>
  c.json({
    user: c.get("user"),
    tenant: c.get("tenant"),
  }),
);

app.get("/api/overview", async (c) => {
  const db = getDb(c.env);
  return c.json(await getOverview(db, c.get("tenant")));
});

app.get("/api/days", async (c) => {
  const db = getDb(c.env);
  return c.json(await getDays(db, c.get("tenant")));
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
        const result = await getDay(db, tenant, date, async (progress) => {
          await write({ type: "progress", ...progress });
        });
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

  const result = await getDay(db, tenant, date);
  if ("error" in result) return c.json(result, 404);
  return c.json(result);
});

app.get("/api/heatmap", async (c) => {
  const db = getDb(c.env);
  return c.json(await getHeatmap(db, c.get("tenant")));
});

app.get("/api/analytics/monthly", async (c) => {
  const db = getDb(c.env);
  return c.json(await getAnalytics(db, c.get("tenant"), "monthly"));
});

app.get("/api/analytics/yearly", async (c) => {
  const db = getDb(c.env);
  return c.json(await getAnalytics(db, c.get("tenant"), "yearly"));
});

app.get("/api/analytics/day-trips", async (c) => {
  const db = getDb(c.env);
  return c.json(await getAnalytics(db, c.get("tenant"), "day-trips"));
});

app.get("/api/analytics/corridors", async (c) => {
  const db = getDb(c.env);
  return c.json(await getAnalytics(db, c.get("tenant"), "corridors"));
});

app.get("/api/analytics/facts", async (c) => {
  const db = getDb(c.env);
  return c.json(await getAnalytics(db, c.get("tenant"), "facts"));
});

app.get("/api/route-progress", async (c) => {
  const db = getDb(c.env);
  return c.json(await getRouteProgress(db, c.get("tenant")));
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
  return c.json(await listSources(db, c.get("tenant")));
});

app.patch("/api/sources/:id", async (c) => {
  const blocked = blockDemo(c.get("user"));
  if (blocked) return c.json(blocked, 403);

  const body = (await c.req.json().catch(() => null)) as { label?: string } | null;
  if (!body?.label) return c.json({ error: "label is required" }, 400);

  const db = getDb(c.env);
  const result = await renameSource(db, c.get("tenant"), c.req.param("id"), body.label);
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
  const result = await removeSource(db, c.get("tenant"), c.req.param("id"));
  if ("error" in result) return c.json(result, 404);
  return c.json(result);
});

app.get("/api/import/status", async (c) => {
  const db = getDb(c.env);
  return c.json(await getImportStatus(db, c.get("tenant")));
});

app.post("/api/import", async (c) => {
  const blocked = blockDemo(c.get("user"));
  if (blocked) return c.json(blocked, 403);

  const user = c.get("user")!;
  const tenant = c.get("tenant");
  const db = getDb(c.env);

  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return c.json({ error: "Expected multipart form data with a file" }, 400);
  }

  const file = form.get("file");
  if (!isUploadFile(file)) {
    return c.json({ error: "file is required (Timeline JSON)" }, 400);
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return c.json(
      {
        error: `File too large (${Math.round(file.size / 1024 / 1024)}MB). Max 80MB via UI — use CLI: npm run db:import -- --email … --path … --source …`,
      },
      413,
    );
  }

  const name = file.name.toLowerCase();
  if (name.endsWith(".zip") || name.endsWith(".mbox")) {
    return c.json(
      {
        error:
          "Zip/mbox not supported. Upload a Timeline JSON array of visit/activity records.",
      },
      400,
    );
  }

  const sourceIdField = String(form.get("sourceId") ?? "").trim();
  const labelField = String(form.get("label") ?? "").trim();

  let sourceId: string;
  let label: string;

  if (sourceIdField) {
    const existing = await getSourceById(db, tenant, sourceIdField);
    if (!existing) return c.json({ error: "Source not found" }, 404);
    sourceId = existing.id;
    label = existing.label;
  } else {
    label = labelField || `Google account ${(await listSources(db, tenant)).length + 1}`;
    const source = await ensureDataSource(db, { tenant, label });
    sourceId = source.id;
  }

  const jobId = crypto.randomUUID();
  const r2Key = `uploads/${user.id}/${jobId}.json`;

  const bytes = await file.arrayBuffer();
  await c.env.UPLOADS.put(r2Key, bytes, {
    httpMetadata: { contentType: "application/json" },
  });

  await createImportJob(db, {
    id: jobId,
    tenant,
    sourceId,
    userId: user.id,
    r2Key,
    status: "pending",
  });

  c.executionCtx.waitUntil(
    (async () => {
      const jobDb = getDb(c.env);
      try {
        await updateImportJob(jobDb, jobId, { status: "processing" });
        const obj = await c.env.UPLOADS.get(r2Key);
        if (!obj) throw new Error("Uploaded file missing from storage");
        const text = await obj.text();
        let records: unknown;
        try {
          records = JSON.parse(text);
        } catch {
          throw new Error("Invalid JSON file");
        }
        const result = await importSourceData(jobDb, {
          tenant,
          sourceId,
          records,
        });
        await updateImportJob(jobDb, jobId, {
          status: "ready",
          visitCount: result.visitCount,
          activityCount: result.activityCount,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await updateImportJob(jobDb, jobId, {
          status: "error",
          error: message,
        }).catch(() => undefined);
      }
    })(),
  );

  return c.json({ jobId, sourceId, label });
});

app.get("/api/health", (c) => c.json({ ok: true }));

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return app.fetch(request, env, ctx);
    }
    return env.ASSETS.fetch(request);
  },
};
