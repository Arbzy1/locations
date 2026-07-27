import { Hono } from "hono";
import { cors } from "hono/cors";
import { tenantFromRole, type TenantId } from "@locations/db";
import type { Env } from "./env";
import { createAuth } from "./auth";
import {
  getAnalytics,
  getDay,
  getDays,
  getDb,
  getHeatmap,
  getOverview,
  getRouteProgress,
  resolveCoords,
} from "./services";

type Variables = {
  user: { id: string; email: string; name: string; role: string } | null;
  tenant: TenantId;
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use(
  "*",
  cors({
    origin: (origin) => origin || "*",
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
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
  c.set("user", {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role,
  });
  c.set("tenant", tenantFromRole(role));
  return next();
});

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
  const result = await getDay(db, c.get("tenant"), c.req.param("date"));
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
