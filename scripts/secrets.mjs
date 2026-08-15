#!/usr/bin/env node
/**
 * Generate or rotate BETTER_AUTH_SECRET in per-environment .env files,
 * then push staging/production secrets to Cloudflare.
 *
 *   npm run secrets:generate              All env pairs (skip files that already have a real secret)
 *   npm run secrets:generate -- --env staging
 *   npm run secrets:generate -- --force
 *   npm run secrets:rotate                All env pairs
 *   npm run secrets:rotate -- --env staging
 */
import { randomBytes } from "node:crypto";
import { expandEnvNames, takeEnvFlag } from "./env-paths.mjs";
import { isBlankSecret, loadMergedEnv, writeKeyToEnvPair } from "./env-file.mjs";
import { pushWorkerSecrets } from "./cf-sync.mjs";

const SECRET_KEY = "BETTER_AUTH_SECRET";

/** @param {string[]} argv */
function parseArgs(argv) {
  /** @type {{ force: boolean, rotate: boolean, help: boolean }} */
  const opts = { force: false, rotate: false, help: false };
  const rest = [];
  for (const a of argv) {
    if (a === "--force") opts.force = true;
    else if (a === "--rotate") opts.rotate = true;
    else if (a === "--help" || a === "-h") opts.help = true;
    else rest.push(a);
  }
  const hasExplicit = rest.includes("--env") || Boolean(process.env.LOCATIONS_ENV);
  const { name } = takeEnvFlag(rest);
  return { ...opts, env: hasExplicit ? name : "all" };
}

function usage() {
  console.log(`Usage:
  npm run secrets:generate                         Fill blank/placeholder ${SECRET_KEY} in all .env / .dev.vars pairs
  npm run secrets:generate -- --env staging        Staging files only, then cf:sync
  npm run secrets:generate -- --env local          Local .env / .dev.vars only
  npm run secrets:generate -- --force              Replace even if a real secret exists
  npm run secrets:rotate                           Replace every env pair; cf:sync staging + production
  npm run secrets:rotate -- --env staging|production|local
`);
}

function generateSecret() {
  return randomBytes(32).toString("hex");
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    usage();
    return;
  }

  const selected = expandEnvNames(opts.env);

  for (const name of selected) {
    console.log(`\n[${name}]`);
    const merged = loadMergedEnv(name);
    const current = merged[SECRET_KEY];
    const hasReal = !isBlankSecret(current);

    if (!opts.rotate && !opts.force && hasReal) {
      writeKeyToEnvPair(name, SECRET_KEY, current);
      console.log(`  ${SECRET_KEY} already set (use --force or secrets:rotate to replace).`);
    } else {
      const secret = generateSecret();
      writeKeyToEnvPair(name, SECRET_KEY, secret);
      console.log(`  wrote ${SECRET_KEY} (32-byte hex).`);
    }

    if (name === "staging" || name === "production") {
      try {
        pushWorkerSecrets(name, { dryRun: false });
      } catch (err) {
        console.error(`  Cloudflare sync failed: ${err instanceof Error ? err.message : err}`);
        console.error("  Files were still updated. Run npm run cf:sync later.");
        process.exitCode = 1;
      }
    }
  }

  console.log("");
}

main();
