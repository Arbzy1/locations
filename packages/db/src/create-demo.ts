import { loadEnvFiles, takeEnvName } from "./load-env.js";
import { randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { hashPassword } from "better-auth/crypto";
import { ensureDemoLogin } from "./demo-login.js";

/**
 * Create the shared demo login, or reset its password if it exists, with a fresh
 * random password. The password is printed once for the Worker's DEMO_PASSWORD
 * secret; it is never stored in the repo, the Admin UI, or the client bundle.
 *
 *   npm run auth:create-demo -- [--env local|staging|production] [--email demo@locations.app]
 */
async function main() {
  const { name, argv } = takeEnvName();
  loadEnvFiles(name);

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error(`DATABASE_URL is required (${name} env files)`);

  const emailFlag = argv.indexOf("--email");
  const email = (
    (emailFlag >= 0 ? argv[emailFlag + 1] : undefined) ||
    process.env.DEMO_EMAIL ||
    "demo@locations.app"
  )
    .trim()
    .toLowerCase();

  const password = randomBytes(24).toString("base64url");
  const { created } = await ensureDemoLogin(drizzle(neon(url)), {
    email,
    passwordHash: await hashPassword(password),
  });

  console.log(`${created ? "Created" : "Reset"} demo login ${email} (${name}).`);
  if (name === "local") {
    console.log("Add these to .dev.vars, then restart wrangler dev:");
  } else {
    console.log("Set the Worker secrets (paste each value when prompted):");
    console.log(`  npx wrangler secret put DEMO_EMAIL --env ${name}`);
    console.log(`  npx wrangler secret put DEMO_PASSWORD --env ${name}`);
    console.log(`Also put them in .env.${name} so cf:sync and deploy keep them.`);
  }
  console.log(`DEMO_EMAIL=${email}`);
  console.log(`DEMO_PASSWORD=${password}`);
  console.log(
    `Sample journeys for the demo tenant: npm run db:import-demo${name === "local" ? "" : ` -- --env ${name}`}`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  // Drizzle wraps driver errors as "Failed query"; the useful part is the cause.
  const cause = err instanceof Error ? (err.cause as { message?: string; code?: string } | undefined) : undefined;
  if (cause) console.error(`Cause: ${cause.message ?? String(cause)}${cause.code ? ` (code ${cause.code})` : ""}`);
  process.exit(1);
});
