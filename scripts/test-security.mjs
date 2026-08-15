#!/usr/bin/env node
/**
 * Security catalog runner (CI-safe, not a live pentest).
 *
 *   npm run test:security
 */
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const win = process.platform === "win32";

/**
 * Production highs that this suite already encodes as scanners, or that only
 * appear through Better Auth plugin / test tooling nested under a prod dep.
 * New high/critical GHSAs in production deps still fail the runner.
 */
const KNOWN_PROD_HIGHS = new Set([
  "GHSA-GPJ5-G38J-94V9", // drizzle-orm identifier escaping; scanner covers migrate.ts + no user identifiers
  "GHSA-2V37-7H3G-55P8", // nanoid via better-auth -> vitest (plugin-only path)
]);

function run(label, command, args) {
  console.log(`\n== ${label} ==`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: win,
    env: process.env,
  });
  const code = result.status ?? 1;
  if (code !== 0) {
    console.error(`test:security failed at: ${label}`);
    process.exit(code);
  }
  return code;
}

function productionHighIds(auditJson) {
  const ids = new Set();
  const vulns = auditJson?.vulnerabilities ?? {};
  for (const item of Object.values(vulns)) {
    const severity = String(item?.severity ?? "");
    if (severity !== "high" && severity !== "critical") continue;
    for (const via of item?.via ?? []) {
      if (typeof via === "string") continue;
      const url = String(via?.url ?? "");
      const ghsa = url.match(/GHSA-[a-z0-9-]+/i)?.[0];
      if (ghsa) ids.add(ghsa.toUpperCase());
    }
  }
  return [...ids];
}

function auditProduction() {
  console.log("\n== deps:audit (production, high/critical) ==");
  const result = spawnSync("npm", ["audit", "--omit=dev", "--json"], {
    cwd: root,
    shell: win,
    env: process.env,
    encoding: "utf8",
  });
  let parsed = {};
  try {
    parsed = JSON.parse(result.stdout || "{}");
  } catch {
    console.error("npm audit JSON was not parseable");
    process.exit(1);
  }
  const highs = productionHighIds(parsed);
  const unexpected = highs.filter((id) => !KNOWN_PROD_HIGHS.has(id));
  const known = highs.filter((id) => KNOWN_PROD_HIGHS.has(id));
  if (known.length) {
    console.log(`  documented: ${known.join(", ")}`);
  }
  if (unexpected.length) {
    console.error(`  unexpected high/critical: ${unexpected.join(", ")}`);
    console.error("test:security failed at: deps:audit");
    process.exit(1);
  }
  console.log("  production high/critical: ok (no new advisories)");
  return 0;
}

const layers = [];

let code = run("placement", "npm", ["run", "test:placement"]);
layers.push({ layer: "placement", status: code === 0 ? "ok" : "fail" });

code = run("vitest security", "npx", ["vitest", "run", "--project", "security"]);
layers.push({ layer: "security", status: code === 0 ? "ok" : "fail" });

code = run("vitest rls", "npx", ["vitest", "run", "--project", "rls"]);
layers.push({ layer: "rls", status: code === 0 ? "ok" : "fail" });

code = auditProduction();
layers.push({ layer: "deps:audit", status: code === 0 ? "ok" : "fail" });

console.log("\n== test:security summary ==");
for (const row of layers) {
  console.log(`  ${row.status.padEnd(4)} ${row.layer}`);
}
console.log("Out of scope: WAF bypass, live Stripe, staging/prod traffic, exploit PoCs.");
