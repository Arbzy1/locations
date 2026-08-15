import { loadEnvFiles, takeEnvName } from "./load-env.js";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { hashPassword } from "better-auth/crypto";
import { account, user } from "./schema.js";

async function main() {
  const { name, argv } = takeEnvName();
  loadEnvFiles(name);

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error(`DATABASE_URL is required (${name} env files)`);

  const email = argv[0];
  const password = argv[1];
  const displayName = argv[2] || email?.split("@")[0] || "User";
  const role = argv[3] || "admin";

  if (!email || !password) {
    console.error("Usage: npm run auth:create-user -- <email> <password> [name] [role] [--env local|staging|production]");
    process.exit(1);
  }

  const db = drizzle(neon(url));
  const id = randomUUID();
  const hashed = await hashPassword(password);
  const now = new Date();

  await db.insert(user).values({
    id,
    name: displayName,
    email,
    emailVerified: true,
    role,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(account).values({
    id: randomUUID(),
    accountId: id,
    providerId: "credential",
    userId: id,
    password: hashed,
    createdAt: now,
    updatedAt: now,
  });

  console.log(`Created user ${email} (${role}) id=${id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
