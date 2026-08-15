#!/usr/bin/env node
/**
 * Deploy a named Wrangler env and attach secrets from local .env / .dev.vars.
 *
 *   node scripts/deploy.mjs staging
 *   node scripts/deploy.mjs production
 *   node scripts/deploy.mjs staging --preview
 *
 * `wrangler secret bulk` can land secrets on a version that `wrangler deploy`
 * does not treat as configured. `--secrets-file` attaches them to this deploy.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnvName } from "./env-paths.mjs";
import { collectWorkerSecrets } from "./cf-sync.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REQUIRED = ["DATABASE_URL", "BETTER_AUTH_SECRET"];

function usage() {
  console.log(`Usage:
  node scripts/deploy.mjs staging
  node scripts/deploy.mjs production
  node scripts/deploy.mjs staging --preview
`);
}

function wrangler(args) {
  const result = spawnSync("npx", ["wrangler", ...args], {
    cwd: root,
    stdio: "inherit",
    shell: true,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h") || argv.length === 0) {
    usage();
    process.exit(argv.length === 0 ? 1 : 0);
  }
  const preview = argv.includes("--preview");
  const raw = argv.find((a) => a !== "--preview");
  const envName = parseEnvName(raw);
  if (envName === "local") {
    console.error("Deploy a named env: staging or production (not local).");
    process.exit(1);
  }

  const { secrets, skipped } = collectWorkerSecrets(envName);
  const missing = REQUIRED.filter((key) => !secrets[key]);
  if (missing.length) {
    console.error(
      `Missing ${missing.join(", ")} in .env.${envName} / .dev.vars.${envName}. Run npm run secrets:generate first.`,
    );
    process.exit(1);
  }
  if (skipped.length) {
    console.log(`skip blank/placeholder: ${skipped.join(", ")}`);
  }

  const tmpDir = mkdtempSync(join(tmpdir(), `locations-deploy-${envName}-`));
  const secretsFile = join(tmpDir, "secrets.json");
  writeFileSync(secretsFile, JSON.stringify(secrets), "utf8");
  const keys = Object.keys(secrets);
  console.log(`secrets-file (${keys.length}): ${keys.join(", ")}`);

  try {
    if (preview) {
      wrangler(["versions", "upload", "--env", envName, "--secrets-file", secretsFile]);
    } else {
      wrangler(["deploy", "--env", envName, "--secrets-file", secretsFile]);
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

main();
