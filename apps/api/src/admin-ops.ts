import { hashPassword } from "better-auth/crypto";
import {
  account,
  and,
  desc,
  eq,
  exportJobs,
  gt,
  ilike,
  inArray,
  isEntitled,
  isReadOnlyGrace,
  opsAudit,
  quotaForEntitled,
  session,
  sql,
  tenantForUser,
  user,
  withTenant,
} from "@locations/db";
import { APP_VERSION } from "./version";
import type { Env } from "./env";
import { stripeClient } from "./billing";
import { parseCustomTileHosts } from "./map-tiles";
import { EMAIL_KINDS } from "./email/kinds";
import { sendEmailSafe } from "./email";
import { createAuth } from "./auth";
import { deleteR2Prefix } from "./r2-prefix";
import {
  getDb,
  getImportJob,
  getSubscription,
  getUserSettings,
  pingDatabase,
  staffTenantStats,
  updateExportJob,
  updateImportJob,
  wipeTenantData,
} from "./services";
import {
  EMAIL_TEST_KINDS,
  lastAdminDemoteBlocked,
  scrubAuditMeta,
  wipeEmailMatches,
  isAssignableOpsRole,
  isInviteOpsRole,
  escapeLikePrefix,
  sanitizeJobError,
  type OpsAssignableRole,
  type OpsInviteRole,
} from "./admin-guards";
import {
  LAST_RECAP_FLAG_KEY,
  deleteOpsFlag,
  isOpsFlagKey,
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
  let pastDueCount = 0;
  let unverifiedCount = 0;
  let adminCount = 0;
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
    const [unverifiedRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(user)
      .where(eq(user.emailVerified, false));
    unverifiedCount = Number(unverifiedRow?.count ?? 0);
    adminCount = Number(byRole.admin ?? 0);
    const accounts = await db
      .select({ id: user.id, role: user.role })
      .from(user)
      .orderBy(user.id)
      .limit(ROLLUP_CAP);
    for (const accountRow of accounts) {
      const tenant = tenantForUser({ id: accountRow.id, role: accountRow.role });
      const stats = await withTenant(db, tenant, (tx) => staffTenantStats(tx, tenant));
      stuckImportCount += stats.stuckJobCount;
      const sub = await withTenant(db, tenant, (tx) => getSubscription(tx, tenant));
      if (isEntitled(sub, { isDemo: accountRow.role === "demo" }) || accountRow.role === "admin" || accountRow.role === "developer") {
        entitledCount += 1;
      } else {
        lapsedCount += 1;
      }
      if (sub?.status === "past_due") pastDueCount += 1;
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
    attention: {
      stuckImportCount,
      pastDueCount,
      unverifiedCount,
      adminCount,
    },
    diagnostics: {
      stripeConfigured: Boolean(env.STRIPE_SECRET_KEY),
      resendConfigured: Boolean(env.RESEND_API_KEY),
      r2Configured: Boolean(env.UPLOADS),
      queueConfigured: Boolean(env.IMPORT_QUEUE),
    },
  };
}

export async function listOpsUsers(
  env: Env,
  opts: { q?: string; cursor?: string; limit?: number; role?: string; verified?: string; billing?: string },
) {
  const db = getDb(env);
  const limit = clampAdminListLimit(opts.limit ?? 25);
  if (!dbQueryable(db)) return { users: [] as const, cursor: null as string | null, limit };
  const q = opts.q?.trim();
  const prefix = q && q.length >= 2 ? `${escapeLikePrefix(q)}%` : null;
  const conditions = [];
  if (opts.cursor) conditions.push(gt(user.id, opts.cursor));
  if (prefix) conditions.push(ilike(user.email, prefix));
  if (opts.role && ["user", "admin", "developer", "demo"].includes(opts.role)) {
    conditions.push(eq(user.role, opts.role));
  }
  if (opts.verified === "true") conditions.push(eq(user.emailVerified, true));
  if (opts.verified === "false") conditions.push(eq(user.emailVerified, false));
  const where = conditions.length === 0 ? undefined : conditions.length === 1 ? conditions[0] : and(...conditions);
  const billingFilter = opts.billing && ["past_due", "none", "active"].includes(opts.billing) ? opts.billing : null;
  const scanCap = billingFilter ? ROLLUP_CAP : limit + 1;
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
  const rows = await (where ? base.where(where) : base).orderBy(user.id).limit(scanCap);
  const matched: typeof rows = [];
  for (const row of rows) {
    if (billingFilter) {
      const tenant = tenantForUser({ id: row.id, role: row.role });
      const sub = await withTenant(db, tenant, (tx) => getSubscription(tx, tenant));
      const status = sub?.status ?? "none";
      const entitled = isEntitled(sub, { isDemo: row.role === "demo" }) || row.role === "admin" || row.role === "developer";
      if (billingFilter === "past_due" && status !== "past_due") continue;
      if (billingFilter === "none" && status !== "none") continue;
      if (billingFilter === "active" && !entitled) continue;
    }
    matched.push(row);
    if (matched.length >= limit + 1) break;
  }
  const page = matched.slice(0, limit);
  const lastSeen = rows[rows.length - 1]?.id ?? null;
  const next = matched.length > limit ? page[page.length - 1]?.id ?? null : rows.length === scanCap ? lastSeen : null;
  const lastByUser = await lastSessionByUserIds(
    db,
    page.map((row) => row.id),
  );
  return {
    users: page.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role ?? "user",
      emailVerified: row.emailVerified,
      createdAt: row.createdAt?.toISOString?.() ?? String(row.createdAt),
      lastSessionAt: lastByUser.get(row.id) ?? null,
    })),
    cursor: next,
    limit,
  };
}

async function lastSessionByUserIds(
  db: ReturnType<typeof getDb>,
  ids: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const rows = await db
    .select({
      userId: session.userId,
      last: sql<Date>`max(${session.updatedAt})`,
    })
    .from(session)
    .where(inArray(session.userId, ids))
    .groupBy(session.userId);
  for (const row of rows) {
    const last = row.last;
    out.set(row.userId, last instanceof Date ? last.toISOString() : String(last));
  }
  return out;
}

function billingInterval(env: Env, priceId: string | null | undefined): "monthly" | "yearly" | "other" | null {
  if (!priceId) return null;
  if (env.STRIPE_PRICE_MONTHLY && priceId === env.STRIPE_PRICE_MONTHLY) return "monthly";
  if (env.STRIPE_PRICE_YEARLY && priceId === env.STRIPE_PRICE_YEARLY) return "yearly";
  return "other";
}

export async function getOpsUserCard(env: Env, id: string) {
  const account = await findUser(env, id);
  if (!account) return null;
  const db = getDb(env);
  const tenant = tenantForUser({ id: account.id, role: account.role });
  let visitCount = 0;
  let sourceCount = 0;
  let latestImport: { id: string; status: string; error: string | null; ageMinutes: number } | null = null;
  let billingStatus = "none";
  let recapOptIn = false;
  let latestExport: { id: string; status: string; error: string | null } | null = null;
  let sessionCount = 0;
  let lastSessionAt: string | null = null;
  let graceUntil: string | null = null;
  let currentPeriodEnd: string | null = null;
  let interval: "monthly" | "yearly" | "other" | null = null;
  let entitled = false;
  let readOnlyGrace = false;
  if (dbQueryable(db)) {
    const stats = await withTenant(db, tenant, (tx) => staffTenantStats(tx, tenant));
    visitCount = stats.visitCount;
    sourceCount = stats.sourceCount;
    latestImport = stats.recentJobs[0]
      ? {
          id: stats.recentJobs[0].id,
          status: stats.recentJobs[0].status,
          error: sanitizeJobError(stats.recentJobs[0].error),
          ageMinutes: stats.recentJobs[0].ageMinutes,
        }
      : null;
    const sub = await withTenant(db, tenant, (tx) => getSubscription(tx, tenant));
    billingStatus = sub?.status ?? "none";
    graceUntil = sub?.graceUntil ? sub.graceUntil.toISOString() : null;
    currentPeriodEnd = sub?.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null;
    interval = billingInterval(env, sub?.priceId);
    entitled =
      isEntitled(sub, { isDemo: account.role === "demo" }) ||
      account.role === "admin" ||
      account.role === "developer";
    readOnlyGrace = isReadOnlyGrace(sub);
    const settings = await withTenant(db, tenant, (tx) => getUserSettings(tx, tenant));
    recapOptIn = Boolean(settings.monthlyRecapEnabled);
    const exportRows = await withTenant(db, tenant, (tx) =>
      tx
        .select({
          id: exportJobs.id,
          status: exportJobs.status,
          error: exportJobs.error,
        })
        .from(exportJobs)
        .where(eq(exportJobs.tenant, tenant))
        .orderBy(desc(exportJobs.updatedAt))
        .limit(1),
    );
    latestExport = exportRows[0]
      ? { id: exportRows[0].id, status: exportRows[0].status, error: sanitizeJobError(exportRows[0].error) }
      : null;
    const [sess] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(session)
      .where(eq(session.userId, id));
    sessionCount = Number(sess?.count ?? 0);
    const lastMap = await lastSessionByUserIds(db, [id]);
    lastSessionAt = lastMap.get(id) ?? null;
  }
  const quota = quotaForEntitled(entitled);
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
    lastSessionAt,
    billingStatus,
    graceUntil,
    currentPeriodEnd,
    interval,
    entitled,
    readOnlyGrace,
    quota: {
      maxSources: quota.maxSources,
      sourceCount,
      maxUploadBytes: quota.maxUploadBytes,
    },
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
  const pastDue: {
    userId: string;
    email: string;
    status: string;
    graceUntil: string | null;
    currentPeriodEnd: string | null;
    interval: "monthly" | "yearly" | "other" | null;
  }[] = [];
  if (!dbQueryable(db)) return { histogram, pastDue, cursor: null as string | null };
  const base = db.select({ id: user.id, email: user.email, role: user.role }).from(user);
  const accounts = await (cursor ? base.where(gt(user.id, cursor)) : base).orderBy(user.id).limit(ROLLUP_CAP);
  for (const row of accounts) {
    const tenant = tenantForUser({ id: row.id, role: row.role });
    const sub = await withTenant(db, tenant, (tx) => getSubscription(tx, tenant));
    const status = sub?.status ?? "none";
    histogram[status] = (histogram[status] ?? 0) + 1;
    if (status === "past_due") {
      pastDue.push({
        userId: row.id,
        email: row.email,
        status,
        graceUntil: sub?.graceUntil ? sub.graceUntil.toISOString() : null,
        currentPeriodEnd: sub?.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null,
        interval: billingInterval(env, sub?.priceId),
      });
    }
  }
  const next = accounts.length === ROLLUP_CAP ? accounts[accounts.length - 1]?.id ?? null : null;
  return { histogram, pastDue, cursor: next };
}

export async function getOpsImports(env: Env, cursor?: string, status?: string) {
  const db = getDb(env);
  const jobs: {
    userId: string;
    email: string;
    id: string;
    status: string;
    ageMinutes: number;
    parsedCount: number;
    visitCount: number;
    error: string | null;
  }[] = [];
  let stuckCount = 0;
  if (!dbQueryable(db)) return { jobs, stuckCount, cursor: null as string | null };
  const base = db.select({ id: user.id, email: user.email, role: user.role }).from(user);
  const accounts = await (cursor ? base.where(gt(user.id, cursor)) : base).orderBy(user.id).limit(ROLLUP_CAP);
  const filter = status === "stuck" || status === "error" ? status : "all";
  for (const row of accounts) {
    const tenant = tenantForUser({ id: row.id, role: row.role });
    const stats = await withTenant(db, tenant, (tx) => staffTenantStats(tx, tenant));
    stuckCount += stats.stuckJobCount;
    for (const job of stats.recentJobs.slice(0, 3)) {
      const stuck = (job.status === "pending" || job.status === "processing") && job.ageMinutes >= 15;
      if (filter === "stuck" && !stuck) continue;
      if (filter === "error" && job.status !== "error") continue;
      jobs.push({
        userId: row.id,
        email: row.email,
        id: job.id,
        status: job.status,
        ageMinutes: job.ageMinutes,
        parsedCount: job.parsedCount,
        visitCount: job.visitCount,
        error: sanitizeJobError(job.error),
      });
    }
  }
  const next = accounts.length === ROLLUP_CAP ? accounts[accounts.length - 1]?.id ?? null : null;
  return { jobs, stuckCount, cursor: next };
}

export async function getOpsExports(env: Env, cursor?: string) {
  const db = getDb(env);
  const jobs: {
    userId: string;
    email: string;
    id: string;
    status: string;
    error: string | null;
    ageMinutes: number;
  }[] = [];
  const byStatus: Record<string, number> = {};
  if (!dbQueryable(db)) return { jobs, byStatus, cursor: null as string | null };
  const base = db.select({ id: user.id, email: user.email, role: user.role }).from(user);
  const accounts = await (cursor ? base.where(gt(user.id, cursor)) : base).orderBy(user.id).limit(ROLLUP_CAP);
  const now = Date.now();
  for (const row of accounts) {
    const tenant = tenantForUser({ id: row.id, role: row.role });
    const exportRows = await withTenant(db, tenant, (tx) =>
      tx
        .select({
          id: exportJobs.id,
          status: exportJobs.status,
          error: exportJobs.error,
          updatedAt: exportJobs.updatedAt,
        })
        .from(exportJobs)
        .where(eq(exportJobs.tenant, tenant))
        .orderBy(desc(exportJobs.updatedAt))
        .limit(5),
    );
    for (const job of exportRows) {
      byStatus[job.status] = (byStatus[job.status] ?? 0) + 1;
      const updated = job.updatedAt ? new Date(job.updatedAt).getTime() : now;
      jobs.push({
        userId: row.id,
        email: row.email,
        id: job.id,
        status: job.status,
        error: sanitizeJobError(job.error),
        ageMinutes: Number.isFinite(updated) ? Math.max(0, Math.round((now - updated) / 60_000)) : 0,
      });
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
  return { kinds: [...EMAIL_KINDS], lastRecap: last, resendConfigured: Boolean(env.RESEND_API_KEY) };
}

export function getOpsMaps(env: Env) {
  const hosts = parseCustomTileHosts(env.MAP_CUSTOM_TILE_HOSTS);
  return {
    commercialTiles: Boolean(env.MAP_TILE_DARK_URL || env.MAP_STYLE_DARK_URL),
    osrmConfigured: Boolean(env.OSRM_BASE),
    geocodeConfigured: Boolean(env.GEOCODE_BASE),
    customHostsAllowlist: hosts.length > 0,
    customHostCount: hosts.length,
  };
}

export async function getOpsDemo(env: Env) {
  const db = getDb(env);
  if (!dbQueryable(db)) return { exists: false as const };
  const rows = await db
    .select({ id: user.id, email: user.email, role: user.role })
    .from(user)
    .where(eq(user.role, "demo"))
    .limit(1);
  const demo = rows[0];
  if (!demo) return { exists: false as const };
  const tenant = tenantForUser({ id: demo.id, role: demo.role });
  const stats = await withTenant(db, tenant, (tx) => staffTenantStats(tx, tenant));
  return {
    exists: true as const,
    email: demo.email,
    visitCount: stats.visitCount,
    sourceCount: stats.sourceCount,
  };
}

export async function getOpsAnalytics(env: Env) {
  const db = getDb(env);
  const byRole: Record<string, number> = {};
  let importsReady = 0;
  let importsError = 0;
  let recapOptIn = 0;
  let unverifiedCount = 0;
  let entitledCount = 0;
  let lapsedCount = 0;
  const signupsByWeek: { week: string; count: number }[] = [];
  if (dbQueryable(db)) {
    const roleRows = await db
      .select({ role: user.role, count: sql<number>`count(*)::int` })
      .from(user)
      .groupBy(user.role);
    for (const row of roleRows) {
      byRole[row.role ?? "user"] = Number(row.count ?? 0);
    }
    const [unverifiedRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(user)
      .where(eq(user.emailVerified, false));
    unverifiedCount = Number(unverifiedRow?.count ?? 0);
    const created = await db.select({ createdAt: user.createdAt }).from(user);
    const buckets = new Map<string, number>();
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i * 7));
      const week = isoWeekKey(d);
      buckets.set(week, 0);
    }
    for (const row of created) {
      const at = row.createdAt ? new Date(row.createdAt) : null;
      if (!at || Number.isNaN(at.getTime())) continue;
      const key = isoWeekKey(at);
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    for (const [week, count] of buckets) signupsByWeek.push({ week, count });
    const accounts = await db.select({ id: user.id, role: user.role }).from(user).limit(ROLLUP_CAP);
    for (const row of accounts) {
      const tenant = tenantForUser({ id: row.id, role: row.role });
      const stats = await withTenant(db, tenant, (tx) => staffTenantStats(tx, tenant));
      if (stats.latestJobStatus === "ready") importsReady += 1;
      if (stats.latestJobStatus === "error") importsError += 1;
      const settings = await withTenant(db, tenant, (tx) => getUserSettings(tx, tenant));
      if (settings.monthlyRecapEnabled) recapOptIn += 1;
      const sub = await withTenant(db, tenant, (tx) => getSubscription(tx, tenant));
      if (isEntitled(sub, { isDemo: row.role === "demo" }) || row.role === "admin" || row.role === "developer") {
        entitledCount += 1;
      } else {
        lapsedCount += 1;
      }
    }
  }
  return {
    byRole,
    importsReady,
    importsError,
    recapOptIn,
    unverifiedCount,
    entitledCount,
    lapsedCount,
    sampledAccounts: ROLLUP_CAP,
    signupsByWeek,
  };
}

function isoWeekKey(date: Date): string {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function listOpsAudit(env: Env, opts: { cursor?: string; action?: string } = {}) {
  const db = getDb(env);
  if (!dbQueryable(db)) return { entries: [] as const, cursor: null as string | null };
  const conditions = [];
  if (opts.cursor) conditions.push(gt(opsAudit.id, opts.cursor));
  if (opts.action?.trim()) conditions.push(eq(opsAudit.action, opts.action.trim()));
  const where = conditions.length === 0 ? undefined : conditions.length === 1 ? conditions[0] : and(...conditions);
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
  const rows = await (where ? base.where(where) : base)
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
    version: APP_VERSION,
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

export async function resetOpsFlag(
  env: Env,
  actor: AppUser,
  key: string,
): Promise<{ ok: true } | { error: string; status: 400 }> {
  if (!isOpsFlagKey(key)) return { error: "Unknown flag", status: 400 };
  await deleteOpsFlag(env, key);
  await writeOpsAudit({
    env,
    actorUserId: actor.id,
    action: "flags_reset",
    meta: { keys: [key] },
  });
  return { ok: true };
}

function randomInvitePassword(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function inviteOpsUser(
  env: Env,
  actor: AppUser,
  body: { email?: string; name?: string; role?: string },
): Promise<{ ok: true; id: string; reset: "sent" | "skipped" } | { error: string; status: 400 }> {
  const email = body.email?.trim().toLowerCase() ?? "";
  if (!email || !email.includes("@") || email.length > 200) {
    return { error: "Valid email is required", status: 400 };
  }
  const role: OpsInviteRole = isInviteOpsRole(body.role ?? "user") ? (body.role as OpsInviteRole) : "user";
  if (body.role && !isInviteOpsRole(body.role)) {
    return { error: "Invite role must be user or developer", status: 400 };
  }
  const db = getDb(env);
  if (!dbQueryable(db)) return { error: "Not found", status: 400 };
  const existing = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
  if (existing[0]) return { error: "Email already in use", status: 400 };
  const id = crypto.randomUUID();
  const now = new Date();
  const name = (body.name?.trim() || email.split("@")[0] || "User").slice(0, 80);
  const hashed = await hashPassword(randomInvitePassword());
  await db.insert(user).values({
    id,
    name,
    email,
    emailVerified: true,
    role,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(account).values({
    id: crypto.randomUUID(),
    accountId: id,
    providerId: "credential",
    userId: id,
    password: hashed,
    createdAt: now,
    updatedAt: now,
  });
  const reset = await triggerPasswordReset(env, email);
  await writeOpsAudit({
    env,
    actorUserId: actor.id,
    action: "invite",
    targetUserId: id,
    meta: { role, reset },
  });
  return { ok: true, id, reset };
}

async function triggerPasswordReset(env: Env, email: string): Promise<"sent" | "skipped"> {
  try {
    const auth = createAuth(env);
    const api = auth.api as {
      requestPasswordReset?: (args: { body: { email: string } }) => Promise<unknown>;
      forgetPassword?: (args: { body: { email: string } }) => Promise<unknown>;
    };
    if (typeof api.requestPasswordReset === "function") {
      await api.requestPasswordReset({ body: { email } });
      return env.RESEND_API_KEY ? "sent" : "skipped";
    }
    if (typeof api.forgetPassword === "function") {
      await api.forgetPassword({ body: { email } });
      return env.RESEND_API_KEY ? "sent" : "skipped";
    }
  } catch {
    return "skipped";
  }
  return "skipped";
}

export async function sendOpsPasswordReset(
  env: Env,
  actor: AppUser,
  targetId: string,
): Promise<{ ok: true; reset: "sent" | "skipped" } | { error: string; status: 400 | 404 }> {
  const target = await findUser(env, targetId);
  if (!target) return { error: "Not found", status: 404 };
  if (target.role === "demo") return { error: "Demo accounts do not receive email", status: 400 };
  const reset = await triggerPasswordReset(env, target.email);
  await writeOpsAudit({
    env,
    actorUserId: actor.id,
    action: "send_reset",
    targetUserId: targetId,
    meta: { reset },
  });
  return { ok: true, reset };
}

export async function failOpsImportJob(
  env: Env,
  actor: AppUser,
  userId: string,
  jobId: string,
  confirm: string,
): Promise<{ ok: true } | { error: string; status: 400 | 404 }> {
  if (confirm !== "stuck") return { error: "Confirmation required", status: 400 };
  const target = await findUser(env, userId);
  if (!target) return { error: "Not found", status: 404 };
  const db = getDb(env);
  if (!dbQueryable(db)) return { error: "Not found", status: 404 };
  const tenant = tenantForUser({ id: target.id, role: target.role });
  const result = await withTenant(db, tenant, async (tx) => {
    const job = await getImportJob(tx, jobId, tenant);
    if (!job) return { error: "Not found" as const };
    if (job.status !== "pending" && job.status !== "processing") {
      return { error: "Job is not stuck" as const };
    }
    await updateImportJob(tx, jobId, { status: "error", error: "Cancelled by staff (stuck)" }, tenant);
    return { r2Key: job.r2Key as string | null };
  });
  if ("error" in result) {
    const message = String(result.error ?? "Not found");
    return { error: message, status: message === "Not found" ? 404 : 400 };
  }
  if (result.r2Key && env.UPLOADS) {
    await env.UPLOADS.delete(result.r2Key).catch(() => undefined);
  }
  await writeOpsAudit({
    env,
    actorUserId: actor.id,
    action: "import_fail",
    targetUserId: userId,
    meta: { jobId },
  });
  return { ok: true };
}

export async function failOpsExportJob(
  env: Env,
  actor: AppUser,
  userId: string,
  jobId: string,
  confirm: string,
): Promise<{ ok: true } | { error: string; status: 400 | 404 }> {
  if (confirm !== "stuck") return { error: "Confirmation required", status: 400 };
  const target = await findUser(env, userId);
  if (!target) return { error: "Not found", status: 404 };
  const db = getDb(env);
  if (!dbQueryable(db)) return { error: "Not found", status: 404 };
  const tenant = tenantForUser({ id: target.id, role: target.role });
  const result = await withTenant(db, tenant, async (tx) => {
    const rows = await tx
      .select({
        id: exportJobs.id,
        status: exportJobs.status,
        r2Key: exportJobs.r2Key,
      })
      .from(exportJobs)
      .where(and(eq(exportJobs.id, jobId), eq(exportJobs.tenant, tenant)))
      .limit(1);
    const job = rows[0];
    if (!job) return { error: "Not found" as const };
    if (job.status !== "pending" && job.status !== "processing") {
      return { error: "Job is not stuck" as const };
    }
    await updateExportJob(tx, jobId, tenant, { status: "error", error: "Cancelled by staff (stuck)", r2Key: null });
    return { r2Key: job.r2Key ?? null };
  });
  if ("error" in result) {
    const message = String(result.error ?? "Not found");
    return { error: message, status: message === "Not found" ? 404 : 400 };
  }
  if (result.r2Key && env.UPLOADS) {
    await env.UPLOADS.delete(result.r2Key).catch(() => undefined);
  }
  await writeOpsAudit({
    env,
    actorUserId: actor.id,
    action: "export_fail",
    targetUserId: userId,
    meta: { jobId },
  });
  return { ok: true };
}

export async function sendOpsEmailTest(
  env: Env,
  actor: AppUser,
  kind: string,
): Promise<{ ok: true; result: "sent" | "skipped" | "failed" } | { error: string; status: 400 }> {
  if (!(EMAIL_TEST_KINDS as readonly string[]).includes(kind)) {
    return { error: "Kind is not allowed for a self-test", status: 400 };
  }
  const result = await sendEmailSafe(env, {
    kind: "password_changed",
    to: actor.email,
    isDemo: actor.role === "demo",
  });
  await writeOpsAudit({
    env,
    actorUserId: actor.id,
    action: "email_test",
    meta: { kind: "password_changed", result },
  });
  return { ok: true, result };
}

type ProbeResult = { name: string; ok: boolean; status: number; ms: number };

async function probeUrl(name: string, url: string | null): Promise<ProbeResult> {
  if (!url) return { name, ok: false, status: 0, ms: 0 };
  const started = Date.now();
  try {
    const res = await fetch(url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(2500) });
    return { name, ok: res.status < 500, status: res.status, ms: Date.now() - started };
  } catch {
    return { name, ok: false, status: 0, ms: Date.now() - started };
  }
}

function tileProbeUrl(template?: string): string | null {
  if (!template) return null;
  return template.replaceAll("{s}", "a").replaceAll("{z}", "0").replaceAll("{x}", "0").replaceAll("{y}", "0");
}

export async function getOpsMapsProbe(env: Env): Promise<{ probes: ProbeResult[] }> {
  const osrm = env.OSRM_BASE?.replace(/\/$/, "") ?? "";
  const geocode = env.GEOCODE_BASE?.replace(/\/$/, "") ?? "";
  const probes = await Promise.all([
    probeUrl("tiles", tileProbeUrl(env.MAP_TILE_DARK_URL || env.MAP_TILE_LIGHT_URL)),
    probeUrl("osrm", osrm ? `${osrm}/route/v1/driving/0,0;0.001,0?overview=false` : null),
    probeUrl("geocode", geocode ? `${geocode}/search?q=x&limit=1` : null),
  ]);
  return { probes };
}

export { listToggleFlags };
