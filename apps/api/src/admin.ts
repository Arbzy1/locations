import type { Hono } from "hono";
import { isAdminRole, isStaffRole, withTenant } from "@locations/db";
import type { Env } from "./env";
import { getDb, staffTenantStats } from "./services";
import { isOpsFlagKey, listToggleFlags, type OpsFlagKey } from "./ops-flags";
import {
  getOpsAnalytics,
  getOpsBilling,
  getOpsDemo,
  getOpsDiagnostics,
  getOpsEmail,
  getOpsExports,
  getOpsImports,
  getOpsMaps,
  getOpsOverview,
  getOpsUserCard,
  listOpsAudit,
  listOpsUsers,
  patchOpsFlags,
  revokeOpsUserSessions,
  setOpsUserRole,
  verifyOpsUser,
  wipeOpsUser,
} from "./admin-ops";
import { clientIp, rateLimit } from "./rate-limit";

type Variables = {
  user: { id: string; email: string; name: string; role: string } | null;
  tenant: string;
};

type AdminApp = Hono<{ Bindings: Env; Variables: Variables }>;

function staffUser(c: { get: (key: "user") => Variables["user"] }) {
  return c.get("user");
}

function notFound(c: { json: (body: unknown, status: 404) => Response }) {
  return c.json({ error: "Not found" }, 404);
}

function requireStaff(c: {
  get: (key: "user") => Variables["user"];
  json: (body: unknown, status: 404) => Response;
}) {
  const user = staffUser(c);
  if (!user || !isStaffRole(user.role)) return { error: notFound(c) };
  return { user };
}

function requireAdmin(c: {
  get: (key: "user") => Variables["user"];
  json: (body: unknown, status: 404) => Response;
}) {
  const user = staffUser(c);
  if (!user || !isAdminRole(user.role)) return { error: notFound(c) };
  return { user };
}

function rejectMutLimit(
  c: {
    get: (key: "user") => Variables["user"];
    req: { raw: { headers: Headers } };
    header: (name: string, value: string) => void;
    json: (body: unknown, status: 429) => Response;
  },
) {
  const user = staffUser(c);
  const ip = clientIp(c.req.raw.headers);
  const limited = rateLimit({
    key: `admin-mut:${user?.id ?? ip}`,
    limit: 20,
    windowMs: 60_000,
  });
  if (limited.ok) return null;
  c.header("Retry-After", String(limited.retryAfterSec));
  return c.json({ error: "Too many requests. Try again later." }, 429);
}

export function registerAdminRoutes(app: AdminApp) {
  app.get("/api/admin/stats", async (c) => {
    const gate = requireStaff(c);
    if ("error" in gate) return gate.error;
    const db = getDb(c.env);
    const tenant = c.get("tenant");
    return c.json(await withTenant(db, tenant, (tx) => staffTenantStats(tx, tenant)));
  });

  app.get("/api/admin/overview", async (c) => {
    const gate = requireStaff(c);
    if ("error" in gate) return gate.error;
    return c.json(await getOpsOverview(c.env));
  });

  app.get("/api/admin/flags", async (c) => {
    const gate = requireStaff(c);
    if ("error" in gate) return gate.error;
    return c.json(await listToggleFlags(c.env));
  });

  app.patch("/api/admin/flags", async (c) => {
    const gate = requireAdmin(c);
    if ("error" in gate) return gate.error;
    const limited = rejectMutLimit(c);
    if (limited) return limited;
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") return c.json({ error: "No flags to update" }, 400);
    const patch: Partial<Record<OpsFlagKey, boolean>> = {};
    for (const [key, value] of Object.entries(body)) {
      if (!isOpsFlagKey(key)) continue;
      if (typeof value !== "boolean") return c.json({ error: "Flag values must be boolean" }, 400);
      patch[key] = value;
    }
    if (Object.keys(patch).length === 0) return c.json({ error: "No flags to update" }, 400);
    const result = await patchOpsFlags(c.env, gate.user, patch);
    if ("error" in result) return c.json({ error: result.error }, result.status);
    console.log(JSON.stringify({ userId: gate.user.id, action: "flags", ok: true }));
    return c.json(await listToggleFlags(c.env));
  });

  app.get("/api/admin/users", async (c) => {
    const gate = requireStaff(c);
    if ("error" in gate) return gate.error;
    const url = new URL(c.req.url);
    const q = url.searchParams.get("q") ?? undefined;
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const limitRaw = Number(url.searchParams.get("limit") ?? "25");
    const limit = Number.isFinite(limitRaw) ? limitRaw : 25;
    return c.json(await listOpsUsers(c.env, { q, cursor, limit }));
  });

  app.get("/api/admin/users/:id", async (c) => {
    const gate = requireStaff(c);
    if ("error" in gate) return gate.error;
    const card = await getOpsUserCard(c.env, c.req.param("id"));
    if (!card) return notFound(c);
    return c.json(card);
  });

  app.post("/api/admin/users/:id/role", async (c) => {
    const gate = requireAdmin(c);
    if ("error" in gate) return gate.error;
    const limited = rejectMutLimit(c);
    if (limited) return limited;
    const body = (await c.req.json().catch(() => null)) as { role?: string } | null;
    const result = await setOpsUserRole(c.env, gate.user, c.req.param("id"), body?.role ?? "");
    if ("error" in result) return c.json({ error: result.error }, result.status);
    console.log(JSON.stringify({ userId: gate.user.id, action: "role", ok: true }));
    return c.json(result);
  });

  app.post("/api/admin/users/:id/revoke-sessions", async (c) => {
    const gate = requireAdmin(c);
    if ("error" in gate) return gate.error;
    const limited = rejectMutLimit(c);
    if (limited) return limited;
    const result = await revokeOpsUserSessions(c.env, gate.user, c.req.param("id"));
    if ("error" in result) return c.json({ error: result.error }, result.status);
    console.log(JSON.stringify({ userId: gate.user.id, action: "revoke_sessions", ok: true }));
    return c.json(result);
  });

  app.post("/api/admin/users/:id/verify", async (c) => {
    const gate = requireAdmin(c);
    if ("error" in gate) return gate.error;
    const limited = rejectMutLimit(c);
    if (limited) return limited;
    const body = (await c.req.json().catch(() => null)) as { emailVerified?: boolean } | null;
    const result = await verifyOpsUser(
      c.env,
      gate.user,
      c.req.param("id"),
      body?.emailVerified !== false,
    );
    if ("error" in result) return c.json({ error: result.error }, result.status);
    console.log(JSON.stringify({ userId: gate.user.id, action: "verify", ok: true }));
    return c.json(result);
  });

  app.post("/api/admin/users/:id/wipe", async (c) => {
    const gate = requireAdmin(c);
    if ("error" in gate) return gate.error;
    const limited = rejectMutLimit(c);
    if (limited) return limited;
    const body = (await c.req.json().catch(() => null)) as { email?: string } | null;
    const result = await wipeOpsUser(c.env, gate.user, c.req.param("id"), body?.email ?? "");
    if ("error" in result) return c.json({ error: result.error }, result.status);
    return c.json(result);
  });

  app.get("/api/admin/billing", async (c) => {
    const gate = requireStaff(c);
    if ("error" in gate) return gate.error;
    return c.json(await getOpsBilling(c.env, new URL(c.req.url).searchParams.get("cursor") ?? undefined));
  });

  app.get("/api/admin/imports", async (c) => {
    const gate = requireStaff(c);
    if ("error" in gate) return gate.error;
    return c.json(await getOpsImports(c.env, new URL(c.req.url).searchParams.get("cursor") ?? undefined));
  });

  app.get("/api/admin/exports", async (c) => {
    const gate = requireStaff(c);
    if ("error" in gate) return gate.error;
    return c.json(await getOpsExports(c.env, new URL(c.req.url).searchParams.get("cursor") ?? undefined));
  });

  app.get("/api/admin/email", async (c) => {
    const gate = requireStaff(c);
    if ("error" in gate) return gate.error;
    return c.json(await getOpsEmail(c.env));
  });

  app.get("/api/admin/maps", async (c) => {
    const gate = requireStaff(c);
    if ("error" in gate) return gate.error;
    return c.json(getOpsMaps(c.env));
  });

  app.get("/api/admin/demo", async (c) => {
    const gate = requireStaff(c);
    if ("error" in gate) return gate.error;
    return c.json(await getOpsDemo(c.env));
  });

  app.get("/api/admin/analytics", async (c) => {
    const gate = requireStaff(c);
    if ("error" in gate) return gate.error;
    return c.json(await getOpsAnalytics(c.env));
  });

  app.get("/api/admin/audit", async (c) => {
    const gate = requireStaff(c);
    if ("error" in gate) return gate.error;
    return c.json(await listOpsAudit(c.env, new URL(c.req.url).searchParams.get("cursor") ?? undefined));
  });

  app.get("/api/admin/diagnostics", async (c) => {
    const gate = requireStaff(c);
    if ("error" in gate) return gate.error;
    return c.json(await getOpsDiagnostics(c.env));
  });
}
