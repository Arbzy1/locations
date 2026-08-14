#!/usr/bin/env node
/**
 * Upload Worker secrets from per-env .env / .dev.vars to Cloudflare.
 *
 *   npm run cf:sync
 *   npm run cf:sync -- --env staging
 *   npm run cf:sync -- --env production
 *   npm run cf:sync -- --env all --dry-run
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expandEnvNames, takeEnvFlag } from "./env-paths.mjs";
import { WORKER_SECRET_KEYS, isBlankSecret, loadMergedEnv } from "./env-file.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * @param {import("./env-paths.mjs").EnvName} name
 * @returns {{ secrets: Record<string, string>, skipped: string[] }}
 */
export function collectWorkerSecrets(name) {
  const merged = loadMergedEnv(name);
  /** @type {Record<string, string>} */
  const secrets = {};
  /** @type {string[]} */
  const skipped = [];
  for (const key of WORKER_SECRET_KEYS) {
    const value = merged[key];
    if (isBlankSecret(value)) {
      skipped.push(key);
      continue;
    }
    secrets[key] = value;
  }
  return { secrets, skipped };
}

/**
 * @param {import("./env-paths.mjs").EnvName} name
 * @param {{ dryRun?: boolean }} [opts]
 */
export function pushWorkerSecrets(name, opts = {}) {
  if (name === "local") {
    console.log("  skip Cloudflare (local uses .dev.vars, not Worker secrets).");
    return;
  }

  const { secrets, skipped } = collectWorkerSecrets(name);
  const keys = Object.keys(secrets);
  if (skipped.length) {
    console.log(`  skip blank/placeholder: ${skipped.join(", ")}`);
  }
  if (!keys.length) {
    console.log("  nothing to upload (fill .env files first).");
    return;
  }

  if (opts.dryRun) {
    console.log(`  [dry-run] wrangler secret bulk --env ${name}: ${keys.join(", ")}`);
    return;
  }

  const tmpDir = mkdtempSync(join(tmpdir(), `locations-secrets-${name}-`));
  const tmpPath = join(tmpDir, "secrets.json");
  writeFileSync(tmpPath, JSON.stringify(secrets), "utf8");
  try {
    console.log(`  wrangler secret bulk --env ${name}: ${keys.join(", ")}`);
    const result = spawnSync("npx", ["wrangler", "secret", "bulk", tmpPath, "--env", name], {
      cwd: root,
      stdio: "inherit",
      shell: true,
    });
    if (result.status !== 0) {
      throw new Error(`wrangler secret bulk failed for --env ${name}`);
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

function usage() {
  console.log(`Usage:
  npm run cf:sync                         Staging + production
  npm run cf:sync -- --env staging
  npm run cf:sync -- --env production
  npm run cf:sync -- --dry-run
`);
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    usage();
    return;
  }
  const dryRun =
    argv.includes("--dry-run") || process.env.npm_config_dry_run === "true";
  const rest = argv.filter((a) => a !== "--dry-run");
  const hasExplicit = rest.includes("--env") || Boolean(process.env.LOCATIONS_ENV);
  const { name } = takeEnvFlag(rest);
  const names = expandEnvNames(!hasExplicit || name === "all" ? "all" : name).filter(
    (n) => n !== "local",
  );

  if (!names.length) {
    console.error("  cf:sync only uploads staging and production (not local).");
    process.exit(1);
  }

  console.log(`\nCloudflare secret sync${dryRun ? " (dry-run)" : ""}\n`);
  for (const envName of names) {
    console.log(`[${envName}]`);
    pushWorkerSecrets(envName, { dryRun });
    console.log("");
  }
}

const invokedAsScript = /cf-sync\.mjs$/i.test(process.argv[1] ?? "");
if (invokedAsScript) main();
