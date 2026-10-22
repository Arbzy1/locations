import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { account, session, user } from "./schema.js";

type Db = NeonHttpDatabase<Record<string, never>>;

/**
 * Create the shared demo login, or point an existing one at a new password hash.
 * Refuses to touch an account that is not role "demo". Resetting also drops the
 * demo's sessions so logins made with the old password stop working.
 */
export async function ensureDemoLogin(
  db: Db,
  opts: { email: string; passwordHash: string; now?: Date },
): Promise<{ userId: string; created: boolean }> {
  const now = opts.now ?? new Date();
  const email = opts.email.trim().toLowerCase();
  const credential = (userId: string) => ({
    id: randomUUID(),
    accountId: userId,
    providerId: "credential",
    userId,
    password: opts.passwordHash,
    createdAt: now,
    updatedAt: now,
  });

  const existing = await db.select().from(user).where(eq(user.email, email)).limit(1);
  const found = existing[0];
  if (!found) {
    const userId = randomUUID();
    await db.insert(user).values({
      id: userId,
      name: "Demo",
      email,
      emailVerified: true,
      role: "demo",
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(account).values(credential(userId));
    return { userId, created: true };
  }

  if (found.role !== "demo") {
    throw new Error(`${email} belongs to a ${found.role} account; refusing to turn it into the demo login.`);
  }
  await db.update(user).set({ emailVerified: true, updatedAt: now }).where(eq(user.id, found.id));
  const updated = await db
    .update(account)
    .set({ password: opts.passwordHash, updatedAt: now })
    .where(and(eq(account.userId, found.id), eq(account.providerId, "credential")))
    .returning({ id: account.id });
  if (!updated.length) await db.insert(account).values(credential(found.id));
  await db.delete(session).where(eq(session.userId, found.id));
  return { userId: found.id, created: false };
}
