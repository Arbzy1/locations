import { loadEnvFiles, takeEnvName } from "./load-env.js";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { isStaffRole, user } from "./schema.js";

async function main() {
  const { name, argv } = takeEnvName();
  loadEnvFiles(name);

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error(`DATABASE_URL is required (${name} env files)`);

  const role = argv[0];
  const email = argv[1];

  if (!email || !isStaffRole(role)) {
    console.error("Usage: npm run auth:promote-admin -- <email> [--env local|staging|production]");
    console.error("       npm run auth:promote-developer -- <email> [--env local|staging|production]");
    process.exit(1);
  }

  const db = drizzle(neon(url));
  const updated = await db
    .update(user)
    .set({ role, updatedAt: new Date() })
    .where(eq(user.email, email))
    .returning({ id: user.id, email: user.email, role: user.role });

  if (updated.length === 0) {
    console.error(`User not found: ${email}`);
    process.exit(1);
  }

  console.log(`Promoted ${updated[0].email} to ${updated[0].role} id=${updated[0].id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
