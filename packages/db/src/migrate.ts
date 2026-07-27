import { config } from "dotenv";
import { readdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../.env") });
config({ path: resolve(__dirname, "../../../.dev.vars") });

function splitSql(body: string): string[] {
  const withoutLineComments = body
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("--");
      return idx >= 0 ? line.slice(0, idx) : line;
    })
    .join("\n");

  return withoutLineComments
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const dir = resolve(__dirname, "../drizzle");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const db = drizzle(neon(url));
  for (const file of files) {
    // Only apply incremental migrations after init on existing DBs.
    // 0000 is idempotent (IF NOT EXISTS). 0001 adds tenant columns.
    const body = readFileSync(resolve(dir, file), "utf-8");
    const statements = splitSql(body);
    console.log(`Applying ${statements.length} statements from ${file}...`);
    for (const statement of statements) {
      try {
        await db.execute(sql.raw(statement));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Ignore benign re-run errors
        if (
          message.includes("already exists") ||
          message.includes("duplicate key") ||
          message.includes("multiple primary keys")
        ) {
          console.log(`  skip: ${message.slice(0, 80)}`);
          continue;
        }
        throw err;
      }
    }
  }
  console.log("Migrations complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
