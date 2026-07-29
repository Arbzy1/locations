import { config } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import * as schema from "./schema.js";
import { user } from "./schema.js";
import { ensureDataSource, importSourceData } from "./timeline-import.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../.env") });
config({ path: resolve(__dirname, "../../../.dev.vars") });

function parseArgs(argv: string[]) {
  const out: {
    email?: string;
    userId?: string;
    path?: string;
    source?: string;
  } = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--email" && next) {
      out.email = next;
      i++;
    } else if ((a === "--user-id" || a === "--userId") && next) {
      out.userId = next;
      i++;
    } else if ((a === "--path" || a === "-p") && next) {
      out.path = next;
      i++;
    } else if ((a === "--source" || a === "-s") && next) {
      out.source = next;
      i++;
    }
  }
  return out;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const args = parseArgs(process.argv.slice(2));
  const root = resolve(__dirname, "../../..");
  const samplePath = resolve(root, "data/sample-location-history.json");
  const personalDefault = resolve(root, "../location-history.json");

  const db = drizzle(neon(url), { schema });

  let tenant: string;
  let sourceLabel: string;

  const envTenant = (process.env.TENANT || "").trim();

  if (envTenant === "demo" && !args.email && !args.userId) {
    tenant = "demo";
    sourceLabel = args.source?.trim() || "demo";
  } else if (args.email || args.userId) {
    let userId = args.userId;
    if (args.email) {
      const rows = await db
        .select()
        .from(user)
        .where(eq(user.email, args.email))
        .limit(1);
      if (!rows[0]) {
        throw new Error(`No user found with email ${args.email}. Create one with auth:create-user.`);
      }
      if (rows[0].role === "demo") {
        tenant = "demo";
      } else {
        tenant = rows[0].id;
      }
      userId = rows[0].id;
    } else {
      const rows = await db
        .select()
        .from(user)
        .where(eq(user.id, args.userId!))
        .limit(1);
      if (!rows[0]) throw new Error(`No user found with id ${args.userId}`);
      tenant = rows[0].role === "demo" ? "demo" : rows[0].id;
      userId = rows[0].id;
    }
    sourceLabel = args.source?.trim() || `import-${(userId ?? "user").slice(0, 8)}`;
  } else if (envTenant && envTenant !== "personal") {
    // Legacy: TENANT=<userId> for scripting
    tenant = envTenant;
    sourceLabel = args.source?.trim() || "default";
  } else {
    console.error(`Usage:
  npm run db:import -- --email you@example.com --path ./timeline.json --source "personal@gmail.com"
  npm run db:import -- --user-id <id> --path ./timeline.json --source "work"
  TENANT=demo npm run db:import-demo`);
    process.exit(1);
  }

  let dataPath: string;
  if (args.path) {
    dataPath = resolve(process.cwd(), args.path);
  } else if (process.env.DATA_PATH) {
    dataPath = resolve(root, process.env.DATA_PATH);
  } else if (tenant === "demo") {
    dataPath = samplePath;
  } else if (existsSync(personalDefault)) {
    dataPath = personalDefault;
  } else {
    dataPath = samplePath;
  }

  if (!existsSync(dataPath)) {
    throw new Error(`Data file not found: ${dataPath}`);
  }

  console.log(`Importing ${dataPath}`);
  console.log(`  tenant="${tenant}" source="${sourceLabel}"`);

  const raw = JSON.parse(readFileSync(dataPath, "utf-8")) as unknown;
  const source = await ensureDataSource(db, { tenant, label: sourceLabel });
  console.log(
    source.created
      ? `Created source ${source.id} (${source.label})`
      : `Using existing source ${source.id} (${source.label})`,
  );

  const result = await importSourceData(db, {
    tenant,
    sourceId: source.id,
    records: raw,
  });

  console.log("Import complete.", result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
