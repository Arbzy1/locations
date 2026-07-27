import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../.env") });
config({ path: resolve(__dirname, "../../../.dev.vars") });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const sqlFile = resolve(__dirname, "../drizzle/0000_init.sql");
  const body = readFileSync(sqlFile, "utf-8");
  const statements = body
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const db = drizzle(neon(url));
  console.log(`Applying ${statements.length} statements from 0000_init.sql...`);
  for (const statement of statements) {
    await db.execute(sql.raw(statement));
  }
  console.log("Migrations complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
