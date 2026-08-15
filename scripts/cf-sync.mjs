#!/usr/bin/env node
/**
 * Upload Worker secrets from per-env .env / .dev.vars to Cloudflare.
 * Keys come from `.env*.example` minus wrangler.toml `[vars]` (see WORKER_SECRET_KEYS).
 * Remote secrets that are no longer in that list are deleted.
 *
 *   npm run cf:sync
 *   npm run cf:sync -- --env staging
 *   npm run cf:sync -- --env production
 *   npm run cf:sync -- --env all --dry-run
 *   npm run cf:sync -- --no-prune
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expandEnvNames, takeEnvFlag } from "./env-paths.mjs";
import {
  WORKER_SECRET_KEYS,
  isBlankSecret,
  loadMergedEnv,
  parseSecretListOutput,
  secretBulkPayload,
} from "./env-file.mjs";

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
 * @returns {string[]}
 */
function listRemoteSecretNames(name) {
  const result = spawnSync(
    "npx",
    ["wrangler", "secret", "list", "--env", name, "--format", "json"],
    { cwd: root, encoding: "utf8", shell: true },
  );
  if (result.status !== 0) {
    const err = String(result.stderr || result.stdout || "").trim();
    throw new Error(err || `wrangler secret list failed for --env ${name}`);
  }
  return parseSecretListOutput(result.stdout);
}

/**
 * @param {import("./env-paths.mjs").EnvName} name
 * @param {{ dryRun?: boolean, prune?: boolean }} [opts]
 */
export function pushWorkerSecrets(name, opts = {}) {
  if (name === "local") {
    console.log("  skip Cloudflare (local uses .dev.vars, not Worker secrets).");
    return;
  }

  const prune = opts.prune !== false;
  const { secrets, skipped } = collectWorkerSecrets(name);
  const keys = Object.keys(secrets);
  if (skipped.length) {
    console.log(`  skip blank/placeholder: ${skipped.join(", ")}`);
  }

  /** @type {string[]} */
  let remoteNames = [];
  if (prune) {
    try {
      remoteNames = listRemoteSecretNames(name);
    } catch (err) {
      console.error(
        `  could not list remote secrets (prune skipped): ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  const { payload, pruned } = secretBulkPayload({ secrets, remoteNames });
  if (pruned.length) {
    console.log(`  prune unmanaged: ${pruned.join(", ")}`);
  }
  if (!keys.length && !pruned.length) {
    console.log("  nothing to upload (fill .env files first).");
    return;
  }

  const upsert = keys.join(", ") || "(none)";
  if (opts.dryRun) {
    console.log(`  [dry-run] wrangler secret bulk --env ${name}: ${upsert}`);
    return;
  }

  const tmpDir = mkdtempSync(join(tmpdir(), `locations-secrets-${name}-`));
  const tmpPath = join(tmpDir, "secrets.json");
  writeFileSync(tmpPath, JSON.stringify(payload), "utf8");
  try {
    console.log(`  wrangler secret bulk --env ${name}: ${upsert}`);
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
  npm run cf:sync -- --no-prune
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
  const prune = !argv.includes("--no-prune");
  const rest = argv.filter((a) => a !== "--dry-run" && a !== "--no-prune");
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
  console.log(`  managed keys: ${WORKER_SECRET_KEYS.join(", ")}\n`);
  for (const envName of names) {
    console.log(`[${envName}]`);
    pushWorkerSecrets(envName, { dryRun, prune });
    console.log("");
  }
}

const invokedAsScript = /cf-sync\.mjs$/i.test(process.argv[1] ?? "");
if (invokedAsScript) main();
