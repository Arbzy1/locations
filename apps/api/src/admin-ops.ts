import {
  and,
  desc,
  eq,
  exportJobs,
  gt,
  ilike,
  isEntitled,
  opsAudit,
  session,
  sql,
  tenantForUser,
  user,
  withTenant,
} from "@locations/db";
import type { Env } from "./env";
import { stripeClient } from "./billing";
import { parseCustomTileHosts } from "./map-tiles";
import { EMAIL_KINDS } from "./email/kinds";
import { deleteR2Prefix } from "./r2-prefix";
import {
  getDb,
  getSubscription,
  getUserSettings,
  pingDatabase,
  staffTenantStats,
  wipeTenantData,
} from "./services";
import {
  lastAdminDemoteBlocked,
  scrubAuditMeta,
  wipeEmailMatches,
  isAssignableOpsRole,
  escapeLikePrefix,
  type OpsAssignableRole,
} from "./admin-guards";
import {
  LAST_RECAP_FLAG_KEY,
  listToggleFlags,
  readInternalFlag,
  resolveOpsFlags,
  upsertOpsFlag,
  type OpsFlagKey,
} from "./ops-flags";

const LIST_CAP = 50;
const ROLLUP_CAP = 100;
const AUDIT_CAP = 50;

export function clampAdminListLimit(n: number): number {
  if (!Number.isFinite(n)) return 25;
  return Math.min(Math.max(n, 1), LIST_CAP);
}

type AppUser = { id: string; email: string; name: string; role: string };

function dbQueryable(db: unknown): db is {
  select: (...args: never[]) => unknown;
  insert: (...args: never[]) => unknown;
  update: (...args: never[]) => unknown;
  delete: (...args: never[]) => unknown;
} {
  return typeof (db as { select?: unknown })?.select === "function";
}

export async function writeOpsAudit(opts: {
  env: Env;
  actorUserId: string;
  action: string;
  targetUserId?: string | null;
  meta?: Record<string, unknown>;
}): Promise<void> {
  const db = getDb(opts.env);
  if (!dbQueryable(db)) return;
  await db.insert(opsAudit).values({
    id: crypto.randomUUID(),
    actorUserId: opts.actorUserId,
    action: opts.action,
    targetUserId: opts.targetUserId ?? null,
    meta: scrubAuditMeta(opts.meta),
    createdAt: new Date(),
  });
}

async function countAdmins(env: Env): Promise<number> {
  const db = getDb(env);
  if (!dbQueryable(db)) return 0;
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(user)
    .where(eq(user.role, "admin"));
  return Number(row?.count ?? 0);
}

async function findUser(env: Env, id: string) {
  const db = getDb(env);
  if (!dbQueryable(db)) return null;
  const rows = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(eq(user.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function getOpsOverview(env: Env) {
  const dbOk = await pingDatabase(env).catch(() => false);
  const flags = await resolveOpsFlags(env);
  const db = getDb(env);
  const byRole: Record<string, number> = {};
  let total = 0;
  let stuckImportCount = 0;
  let entitledCount = 0;
  let lapsedCount = 0;
  if (dbQueryable(db)) {
    const roleRows = await db
      .select({ role: user.role, count: sql<number>`count(*)::int` })
      .from(user)
      .groupBy(user.role);
    for (const row of roleRows) {
      const role = row.role ?? "user";
      byRole[role] = Number(row.count ?? 0);
      total += Number(row.count ?? 0);
    }
    const accounts = await db
      .select({ id: user.id, role: user.role })
      .from(user)
      .orderBy(user.id)
      .limit(ROLLUP_CAP);
    for (const account of accounts) {
      const tenant = tenantForUser({ id: account.id, role: account.role });
      const stats = await withTenant(db, tenant, (tx) => staffTenantStats(tx, tenant));
      stuckImportCount += stats.stuckJobCount;
      const sub = await withTenant(db, tenant, (tx) => getSubscription(tx, tenant));
      if (isEntitled(sub, { isDemo: account.role === "demo" }) || account.role === "admin" || account.role === "developer") {
        entitledCount += 1;
      } else {
        lapsedCount += 1;
      }
    }
  }
  return {
    worker: "ok" as const,
    db: dbOk,
    flags,
    users: { total, byRole },
    stuckImportCount,
    entitledCount,
    lapsedCount,
    sampledAccounts: Math.min(total, ROLLUP_CAP),
  };
}

export async function listOpsUsers(
  env: Env,
  opts: { q?: string; cursor?: string; limit?: number },
) {
  const db = getDb(env);
  const limit = clampAdminListLimit(opts.limit ?? 25);
  if (!dbQueryable(db)) return { users: [] as const, cursor: null as string | null, limit };
  const q = opts.q?.trim();
  const prefix = q && q.length >= 2 ? `${escapeLikePrefix(q)}%` : null;
  const conditions = [];
  if (opts.cursor) conditions.push(gt(user.id, opts.cursor));
  if (prefix) conditions.push(ilike(user.email, prefix));
  const where = conditions.length === 0 ? undefined : conditions.length === 1 ? conditions[0] : and(...conditions);
  const base = db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
    })
    .from(user);
  const rows = await (where ? base.where(where) : base).orderBy(user.id).limit(limit + 1);
  const page = rows.slice(0, limit);
  const next = rows.length > limit ? page[page.length - 1]?.id ?? null : null;
  return {
    users: page.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role ?? "user",
      emailVerified: row.emailVerified,
      createdAt: row.createdAt?.toISOString?.() ?? String(row.createdAt),
    })),
    cursor: next,
    limit,
  };
}

export async function getOpsUserCard(env: Env, id: string) {
  const account = await findUser(env, id);
  if (!account) return null;
  const db = getDb(env);
  const tenant = tenantForUser({ id: account.id, role: account.role });
  let visitCount = 0;
  let sourceCount = 0;
  let latestImport: { id: string; status: string } | null = null;
  let billingStatus = "none";
  let recapOptIn = false;
  let latestExport: { id: string; status: string } | null = null;
  let sessionCount = 0;
  if (dbQueryable(db)) {
    const stats = await withTenant(db, tenant, (tx) => staffTenantStats(tx, tenant));
    visitCount = stats.visitCount;
    sourceCount = stats.sourceCount;
    latestImport = stats.recentJobs[0]
      ? { id: stats.recentJobs[0].id, status: stats.recentJobs[0].status }
      : null;
    const sub = await withTenant(db, tenant, (tx) => getSubscription(tx, tenant));
    billingStatus = sub?.status ?? "none";
    const settings = await withTenant(db, tenant, (tx) => getUserSettings(tx, tenant));
    recapOptIn = Boolean(settings.monthlyRecapEnabled);
    const exportRows = await withTenant(db, tenant, (tx) =>
      tx
        .select({
          id: exportJobs.id,
          status: exportJobs.status,
        })
        .from(exportJobs)
        .where(eq(exportJobs.tenant, tenant))
        .orderBy(desc(exportJobs.updatedAt))
        .limit(1),
    );
    latestExport = exportRows[0] ?? null;
    const [sess] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(session)
      .where(eq(session.userId, id));
    sessionCount = Number(sess?.count ?? 0);
  }
  return {
    id: account.id,
    email: account.email,
    name: account.name,
    role: account.role ?? "user",
    emailVerified: account.emailVerified,
    createdAt: account.createdAt?.toISOString?.() ?? String(account.createdAt),
    visitCount,
    sourceCount,
    sessionCount,
    billingStatus,
    recapOptIn,
    latestImport,
    latestExport,
  };
}

export async function setOpsUserRole(
  env: Env,
  actor: AppUser,
  targetId: string,
  role: string,
): Promise<{ ok: true } | { error: string; status: 400 | 404 }> {
  if (!isAssignableOpsRole(role)) {
    return { error: "Invalid role", status: 400 };
  }
  const target = await findUser(env, targetId);
  if (!target) return { error: "Not found", status: 404 };
  const adminCount = await countAdmins(env);
  if (lastAdminDemoteBlocked({ currentRole: target.role, nextRole: role, adminCount })) {
    return { error: "Cannot demote the last admin", status: 400 };
  }
  const db = getDb(env);
  if (!dbQueryable(db)) return { error: "Not found", status: 404 };
  await db.update(user).set({ role, updatedAt: new Date() }).where(eq(user.id, targetId));
  await writeOpsAudit({
    env,
    actorUserId: actor.id,
    action: "role",
    targetUserId: targetId,
    meta: { from: target.role ?? "user", to: role as OpsAssignableRole },
  });
  return { ok: true };
}

export async function revokeOpsUserSessions(
  env: Env,
  actor: AppUser,
  targetId: string,
): Promise<{ ok: true; revoked: number } | { error: string; status: 404 }> {
  const target = await findUser(env, targetId);
  if (!target) return { error: "Not found", status: 404 };
  const db = getDb(env);
  if (!dbQueryable(db)) return { error: "Not found", status: 404 };
  const deleted = await db.delete(session).where(eq(session.userId, targetId)).returning({ id: session.id });
  await writeOpsAudit({
    env,
    actorUserId: actor.id,
    action: "revoke_sessions",
    targetUserId: targetId,
    meta: { revoked: deleted.length },
  });
  return { ok: true, revoked: deleted.length };
}

export async function verifyOpsUser(
  env: Env,
  actor: AppUser,
  targetId: string,
  emailVerified: boolean,
): Promise<{ ok: true } | { error: string; status: 404 }> {
  const target = await findUser(env, targetId);
  if (!target) return { error: "Not found", status: 404 };
  const db = getDb(env);
  if (!dbQueryable(db)) return { error: "Not found", status: 404 };
  await db.update(user).set({ emailVerified, updatedAt: new Date() }).where(eq(user.id, targetId));
  await writeOpsAudit({
    env,
    actorUserId: actor.id,
    action: "verify",
    targetUserId: targetId,
    meta: { emailVerified },
  });
  return { ok: true };
}

export async function wipeOpsUser(
  env: Env,
  actor: AppUser,
  targetId: string,
  emailConfirm: string,
): Promise<{ ok: true } | { error: string; status: 400 | 404 }> {
  const target = await findUser(env, targetId);
  if (!target) return { error: "Not found", status: 404 };
  if (target.id === actor.id) return { error: "Cannot wipe your own account", status: 400 };
  if (!wipeEmailMatches(target.email, emailConfirm)) {
    return { error: "Email confirmation does not match", status: 400 };
  }
  if (target.role === "admin") {
    const adminCount = await countAdmins(env);
    if (adminCount <= 1) return { error: "Cannot wipe the last admin", status: 400 };
  }
  const db = getDb(env);
  if (!dbQueryable(db)) return { error: "Not found", status: 404 };
  const tenant = tenantForUser({ id: target.id, role: target.role });
  const sub = await withTenant(db, tenant, (tx) => getSubscription(tx, tenant));
  if (env.UPLOADS) {
    await deleteR2Prefix(env.UPLOADS, `uploads/${target.id}/`);
    await deleteR2Prefix(env.UPLOADS, `exports/${target.id}/`);
  }
  const stripe = stripeClient(env);
  if (stripe && sub?.stripeCustomerId) {
    await stripe.customers.del(sub.stripeCustomerId).catch(() => undefined);
  }
  await withTenant(db, tenant, (tx) => wipeTenantData(tx, tenant, target.id, target.email));
  await writeOpsAudit({
    env,
    actorUserId: actor.id,
    action: "wipe",
    targetUserId: targetId,
    meta: { ok: true },
  });
  console.log(JSON.stringify({ userId: actor.id, action: "wipe", ok: true }));
  return { ok: true };
}

export async function getOpsBilling(env: Env, cursor?: string) {
  const db = getDb(env);
  const histogram: Record<string, number> = {};
  const pastDue: { userId: string; status: string }[] = [];
  if (!dbQueryable(db)) return { histogram, pastDue, cursor: null as string | null };
  const base = db.select({ id: user.id, role: user.role }).from(user);
  const accounts = await (cursor ? base.where(gt(user.id, cursor)) : base).orderBy(user.id).limit(ROLLUP_CAP);
  for (const account of accounts) {
    const tenant = tenantForUser({ id: account.id, role: account.role });
    const sub = await withTenant(db, tenant, (tx) => getSubscription(tx, tenant));
    const status = sub?.status ?? "none";
    histogram[status] = (histogram[status] ?? 0) + 1;
    if (status === "past_due") pastDue.push({ userId: account.id, status });
  }
  const next = accounts.length === ROLLUP_CAP ? accounts[accounts.length - 1]?.id ?? null : null;
  return { histogram, pastDue, cursor: next };
}

export async function getOpsImports(env: Env, cursor?: string) {
  const db = getDb(env);
  const jobs: {
    userId: string;
    id: string;
    status: string;
    ageMinutes: number;
    parsedCount: number;
    visitCount: number;
  }[] = [];
  let stuckCount = 0;
  if (!dbQueryable(db)) return { jobs, stuckCount, cursor: null as string | null };
  const base = db.select({ id: user.id, role: user.role }).from(user);
  const accounts = await (cursor ? base.where(gt(user.id, cursor)) : base).orderBy(user.id).limit(ROLLUP_CAP);
  for (const account of accounts) {
    const tenant = tenantForUser({ id: account.id, role: account.role });
    const stats = await withTenant(db, tenant, (tx) => staffTenantStats(tx, tenant));
    stuckCount += stats.stuckJobCount;
    for (const job of stats.recentJobs.slice(0, 3)) {
      jobs.push({
        userId: account.id,
        id: job.id,
        status: job.status,
        ageMinutes: job.ageMinutes,
        parsedCount: job.parsedCount,
        visitCount: job.visitCount,
      });
    }
  }
  const next = accounts.length === ROLLUP_CAP ? accounts[accounts.length - 1]?.id ?? null : null;
  return { jobs, stuckCount, cursor: next };
}

export async function getOpsExports(env: Env, cursor?: string) {
  const db = getDb(env);
  const jobs: { userId: string; id: string; status: string }[] = [];
  const byStatus: Record<string, number> = {};
  if (!dbQueryable(db)) return { jobs, byStatus, cursor: null as string | null };
  const base = db.select({ id: user.id, role: user.role }).from(user);
  const accounts = await (cursor ? base.where(gt(user.id, cursor)) : base).orderBy(user.id).limit(ROLLUP_CAP);
  for (const account of accounts) {
    const tenant = tenantForUser({ id: account.id, role: account.role });
    const rows = await withTenant(db, tenant, (tx) =>
      tx
        .select({ id: exportJobs.id, status: exportJobs.status })
        .from(exportJobs)
        .where(eq(exportJobs.tenant, tenant))
        .orderBy(desc(exportJobs.updatedAt))
        .limit(5),
    );
    for (const row of rows) {
      byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
      jobs.push({ userId: account.id, id: row.id, status: row.status });
    }
  }
  const next = accounts.length === ROLLUP_CAP ? accounts[accounts.length - 1]?.id ?? null : null;
  return { jobs, byStatus, cursor: next };
}

export async function getOpsEmail(env: Env) {
  let last: { considered: number; sent: number; at?: string } | null = null;
  const raw = await readInternalFlag(env, LAST_RECAP_FLAG_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { considered?: number; sent?: number; at?: string };
      last = {
        considered: Number(parsed.considered ?? 0),
        sent: Number(parsed.sent ?? 0),
        at: parsed.at,
      };
    } catch {
      last = null;
    }
  }
  return { kinds: [...EMAIL_KINDS], lastRecap: last };
}

export function getOpsMaps(env: Env) {
  return {
    commercialTiles: Boolean(env.MAP_TILE_DARK_URL || env.MAP_STYLE_DARK_URL),
    osrmConfigured: Boolean(env.OSRM_BASE),
    geocodeConfigured: Boolean(env.GEOCODE_BASE),
    customHostsAllowlist: parseCustomTileHosts(env.MAP_CUSTOM_TILE_HOSTS).length > 0,
  };
}

export async function getOpsDemo(env: Env) {
  const db = getDb(env);
  if (!dbQueryable(db)) return { exists: false };
  const rows = await db.select({ id: user.id }).from(user).where(eq(user.role, "demo")).limit(1);
  return { exists: Boolean(rows[0]) };
}

export async function getOpsAnalytics(env: Env) {
  const db = getDb(env);
  const byRole: Record<string, number> = {};
  let importsReady = 0;
  let importsError = 0;
  let recapOptIn = 0;
  if (dbQueryable(db)) {
    const roleRows = await db
      .select({ role: user.role, count: sql<number>`count(*)::int` })
      .from(user)
      .groupBy(user.role);
    for (const row of roleRows) {
      byRole[row.role ?? "user"] = Number(row.count ?? 0);
    }
    const accounts = await db.select({ id: user.id, role: user.role }).from(user).limit(ROLLUP_CAP);
    for (const account of accounts) {
      const tenant = tenantForUser({ id: account.id, role: account.role });
      const stats = await withTenant(db, tenant, (tx) => staffTenantStats(tx, tenant));
      if (stats.latestJobStatus === "ready") importsReady += 1;
      if (stats.latestJobStatus === "error") importsError += 1;
      const settings = await withTenant(db, tenant, (tx) => getUserSettings(tx, tenant));
      if (settings.monthlyRecapEnabled) recapOptIn += 1;
    }
  }
  return { byRole, importsReady, importsError, recapOptIn };
}

export async function listOpsAudit(env: Env, cursor?: string) {
  const db = getDb(env);
  if (!dbQueryable(db)) return { entries: [] as const, cursor: null as string | null };
  const base = db
    .select({
      id: opsAudit.id,
      actorUserId: opsAudit.actorUserId,
      action: opsAudit.action,
      targetUserId: opsAudit.targetUserId,
      meta: opsAudit.meta,
      createdAt: opsAudit.createdAt,
    })
    .from(opsAudit);
  const rows = await (cursor ? base.where(gt(opsAudit.id, cursor)) : base)
    .orderBy(desc(opsAudit.createdAt))
    .limit(AUDIT_CAP + 1);
  const page = rows.slice(0, AUDIT_CAP);
  return {
    entries: page.map((row) => ({
      id: row.id,
      actorUserId: row.actorUserId,
      action: row.action,
      targetUserId: row.targetUserId,
      meta: scrubAuditMeta((row.meta ?? {}) as Record<string, unknown>),
      createdAt: row.createdAt?.toISOString?.() ?? String(row.createdAt),
    })),
    cursor: rows.length > AUDIT_CAP ? page[page.length - 1]?.id ?? null : null,
  };
}

export async function getOpsDiagnostics(env: Env) {
  const dbOk = await pingDatabase(env).catch(() => false);
  let flagsLoaded = false;
  try {
    await resolveOpsFlags(env);
    flagsLoaded = true;
  } catch {
    flagsLoaded = false;
  }
  return {
    worker: true,
    db: dbOk,
    flagsLoaded,
    stripeConfigured: Boolean(env.STRIPE_SECRET_KEY),
    resendConfigured: Boolean(env.RESEND_API_KEY),
    r2Configured: Boolean(env.UPLOADS),
    queueConfigured: Boolean(env.IMPORT_QUEUE),
  };
}

export async function patchOpsFlags(
  env: Env,
  actor: AppUser,
  patch: Partial<Record<OpsFlagKey, boolean>>,
): Promise<{ ok: true } | { error: string; status: 400 }> {
  const keys = Object.keys(patch) as OpsFlagKey[];
  if (keys.length === 0) return { error: "No flags to update", status: 400 };
  for (const key of keys) {
    const value = patch[key];
    if (typeof value !== "boolean") continue;
    await upsertOpsFlag(env, key, value ? "true" : "false", actor.id);
  }
  await writeOpsAudit({
    env,
    actorUserId: actor.id,
    action: "flags",
    meta: { keys },
  });
  return { ok: true };
}

export { listToggleFlags };
