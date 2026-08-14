#!/usr/bin/env node
/**
 * Generate or rotate BETTER_AUTH_SECRET in per-environment env files.
 *
 *   npm run secrets:generate
 *   npm run secrets:generate -- --env staging
 *   npm run secrets:generate -- --force
 *   npm run secrets:rotate
 *   npm run secrets:rotate -- --env staging
 *   npm run secrets:rotate -- --env production
 *   npm run secrets:rotate -- --env all
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expandEnvNames, filesFor, takeEnvFlag } from "./env-paths.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
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
  const { name } = takeEnvFlag(rest);
  return { ...opts, env: name };
}

function usage() {
  console.log(`Usage:
  npm run secrets:generate                         Fill empty ${SECRET_KEY} in .env / .dev.vars
  npm run secrets:generate -- --env staging        Staging files only
  npm run secrets:generate -- --force              Replace even if already set
  npm run secrets:rotate                           Always replace local files
  npm run secrets:rotate -- --env staging|production
                                                   Staging/prod files + wrangler secret put
  npm run secrets:rotate -- --env all              Staging and production (not local)
`);
}

function generateSecret() {
  return randomBytes(32).toString("hex");
}

/** @param {string} content @param {string} key */
function readEnvKey(content, key) {
  const re = new RegExp(`^${key}=(.*)$`, "m");
  const m = content.match(re);
  if (!m) return null;
  return m[1].trim().replace(/^["']|["']$/g, "");
}

/**
 * @param {string} filePath
 * @param {string} key
 * @param {string} value
 * @param {{ onlyIfEmpty?: boolean }} [opts]
 * @returns {"created" | "updated" | "skipped" | "missing"}
 */
function upsertEnvKey(filePath, key, value, opts = {}) {
  if (!existsSync(filePath)) return "missing";
  let body = readFileSync(filePath, "utf8");
  const current = readEnvKey(body, key);
  if (opts.onlyIfEmpty && current) return "skipped";

  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(body)) {
    body = body.replace(re, line);
    writeFileSync(filePath, body, "utf8");
    return "updated";
  }
  body = `${body.trimEnd()}\n${line}\n`;
  writeFileSync(filePath, body, "utf8");
  return "created";
}

/** @param {string} filePath @param {string} label @param {string} value @param {boolean} onlyIfEmpty */
function writeLocal(filePath, label, value, onlyIfEmpty) {
  const result = upsertEnvKey(filePath, SECRET_KEY, value, { onlyIfEmpty });
  if (result === "missing") {
    console.log(`  ${label} is missing - skipped (npm run env:merge -- --env …).`);
    return false;
  }
  if (result === "skipped") {
    console.log(`  ${label}: ${SECRET_KEY} already set (use --force to replace).`);
    return false;
  }
  console.log(`  ${label}: ${result} ${SECRET_KEY}.`);
  return true;
}

/** @param {string} envName @param {string} secret */
function pushWranglerSecret(envName, secret) {
  console.log(`  Pushing ${SECRET_KEY} to Worker env ${envName}…`);
  const result = spawnSync(
    "npx",
    ["wrangler", "secret", "put", SECRET_KEY, "--env", envName],
    {
      cwd: root,
      input: secret,
      stdio: ["pipe", "inherit", "inherit"],
      shell: process.platform === "win32",
    },
  );
  if (result.status !== 0) {
    console.error(`  wrangler secret put failed for --env ${envName}.`);
    process.exit(result.status ?? 1);
  }
}

function printPushCommands() {
  console.log(`
  To rotate a Worker env (also updates that env's local files):
    npm run secrets:rotate -- --env staging
    npm run secrets:rotate -- --env production
`);
}

/**
 * @param {import("./env-paths.mjs").EnvName} name
 * @param {string} secret
 * @param {boolean} onlyIfEmpty
 */
function writePair(name, secret, onlyIfEmpty) {
  const files = filesFor(name);
  const envPath = resolve(root, files.env.dest);
  const devPath = resolve(root, files.devVars.dest);
  const wroteEnv = writeLocal(envPath, files.env.label, secret, onlyIfEmpty);
  const wroteDev = writeLocal(devPath, files.devVars.label, secret, onlyIfEmpty);
  return wroteEnv || wroteDev;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    usage();
    return;
  }

  const onlyIfEmpty = !opts.rotate && !opts.force;
  const selected = opts.env === "all"
    ? (opts.rotate ? ["staging", "production"] : expandEnvNames("all"))
    : [opts.env];

  /** @type {string | null} */
  let printed = null;

  for (const name of selected) {
    console.log(`\n[${name}]`);
    const files = filesFor(name);
    const envPath = resolve(root, files.env.dest);
    const devPath = resolve(root, files.devVars.dest);
    const existingEnv = existsSync(envPath)
      ? readEnvKey(readFileSync(envPath, "utf8"), SECRET_KEY)
      : null;
    const existingDev = existsSync(devPath)
      ? readEnvKey(readFileSync(devPath, "utf8"), SECRET_KEY)
      : null;
    const alreadySet = Boolean(existingEnv || existingDev);

    if (onlyIfEmpty && alreadySet) {
      writePair(name, existingEnv || existingDev || "", true);
      console.log("  No new secret generated.");
      continue;
    }

    const secret = generateSecret();
    const wrote = writePair(name, secret, onlyIfEmpty);
    if (wrote) {
      printed = secret;
      console.log(`  ${SECRET_KEY}=${secret}`);
    }

    if (opts.rotate && (name === "staging" || name === "production")) {
      pushWranglerSecret(name, secret);
    }
  }

  if (printed) {
    console.log("\n  Store each value. Rotating it ends existing sessions on that env.");
  }

  if (opts.rotate && opts.env === "local") printPushCommands();
}

main();
