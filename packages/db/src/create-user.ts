import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { hashPassword } from "better-auth/crypto";
import { account, user } from "./schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../.env") });
config({ path: resolve(__dirname, "../../../.dev.vars") });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const email = process.argv[2];
  const password = process.argv[3];
  const name = process.argv[4] || email?.split("@")[0] || "User";
  const role = process.argv[5] || "admin";

  if (!email || !password) {
    console.error("Usage: npm run auth:create-user -- <email> <password> [name] [role]");
    process.exit(1);
  }

  const db = drizzle(neon(url));
  const id = randomUUID();
  const hashed = await hashPassword(password);
  const now = new Date();

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
