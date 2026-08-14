/**
 * Shared .env / .dev.vars read-write helpers.
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { filesFor } from "./env-paths.mjs";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Keys uploaded with `wrangler secret bulk`. Vars already in wrangler.toml stay out. */
export const WORKER_SECRET_KEYS = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "DEMO_EMAIL",
  "DEMO_PASSWORD",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_MONTHLY",
  "STRIPE_PRICE_YEARLY",
  "GRACE_DAYS",
  "MAP_TILE_DARK_URL",
  "MAP_TILE_LIGHT_URL",
  "MAP_TILE_ATTR",
  "OSRM_BASE",
  "GEOCODE_BASE",
];

/** @param {string | null | undefined} value */
export function isBlankSecret(value) {
  if (value == null) return true;
  const v = String(value)
    .trim()
    .replace(/^["']|["']$/g, "");
  if (!v) return true;
  const lower = v.toLowerCase();
  if (lower.includes("generate-a-long-random")) return true;
  if (lower.includes("change-me")) return true;
  if (lower.includes("dev-secret")) return true;
  if (lower.includes("ep-xxx")) return true;
  if (lower.includes("user:password@")) return true;
  if (lower.includes("example.com")) return true;
  if (lower.includes("example.org")) return true;
  if (lower === "changeme") return true;
  return false;
}

/** @param {string} content */
export function parseEnvValues(content) {
  /** @type {Record<string, string>} */
  const values = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    values[m[1]] = unquoteEnvValue(m[2]);
  }
  return values;
}

/** @param {string} value */
function unquoteEnvValue(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return trimmed;
}

/** @param {string} filePath */
export function readEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  return parseEnvValues(readFileSync(filePath, "utf8"));
}

/**
 * @param {import("./env-paths.mjs").EnvName} name
 * @returns {Record<string, string>}
 */
export function loadMergedEnv(name) {
  const files = filesFor(name);
  return {
    ...readEnvFile(resolve(repoRoot, files.env.dest)),
    ...readEnvFile(resolve(repoRoot, files.devVars.dest)),
  };
}

/**
 * @param {string} filePath
 * @param {string} examplePath
 */
export function ensureEnvFile(filePath, examplePath) {
  if (existsSync(filePath)) return false;
  if (!existsSync(examplePath)) {
    writeFileSync(filePath, "", "utf8");
    return true;
  }
  copyFileSync(examplePath, filePath);
  return true;
}

/**
 * @param {string} filePath
 * @param {string} key
 * @param {string} value
 * @returns {"created" | "updated"}
 */
export function upsertEnvKey(filePath, key, value) {
  const existed = existsSync(filePath);
  const original = existed ? readFileSync(filePath, "utf8") : "";
  const nl = original.includes("\r\n") ? "\r\n" : "\n";
  const line = `${key}=${value}`;
  const keyRe = new RegExp(`^${key}=`);
  const lines = original.length ? original.split(/\r?\n/) : [];
  /** Drop a trailing empty split piece so we control the final newline. */
  if (lines.length && lines[lines.length - 1] === "") lines.pop();

  let found = false;
  const out = [];
  for (const l of lines) {
    if (keyRe.test(l)) {
      if (!found) {
        out.push(line);
        found = true;
      }
      continue;
    }
    out.push(l);
  }

  let result;
  if (found) {
    result = "updated";
  } else {
    out.push(line);
    result = existed ? "updated" : "created";
  }

  writeFileSync(filePath, `${out.join(nl)}${nl}`, "utf8");
  return result;
}

/** Keep the first assignment for each key and drop later copies. */
export function collapseDuplicateKeysInFile(filePath) {
  if (!existsSync(filePath)) return false;
  const original = readFileSync(filePath, "utf8");
  const nl = original.includes("\r\n") ? "\r\n" : "\n";
  const lines = original.length ? original.split(/\r?\n/) : [];
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  const seen = new Set();
  /** @type {string[]} */
  const out = [];
  for (const line of lines) {
    const m = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (m) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
    }
    out.push(line);
  }
  const next = out.length ? `${out.join(nl)}${nl}` : "";
  if (next === original) return false;
  writeFileSync(filePath, next, "utf8");
  return true;
}

/**
 * @param {import("./env-paths.mjs").EnvName} name
 * @param {string} key
 * @param {string} value
 */
export function writeKeyToEnvPair(name, key, value) {
  const files = filesFor(name);
  const envPath = resolve(repoRoot, files.env.dest);
  const devPath = resolve(repoRoot, files.devVars.dest);
  const envExample = resolve(repoRoot, files.env.example);
  const devExample = resolve(repoRoot, files.devVars.example);
  if (ensureEnvFile(envPath, envExample)) {
    console.log(`  Created ${files.env.label} from example.`);
  }
  if (ensureEnvFile(devPath, devExample)) {
    console.log(`  Created ${files.devVars.label} from example.`);
  }
  const envResult = upsertEnvKey(envPath, key, value);
  const devResult = upsertEnvKey(devPath, key, value);
  collapseDuplicateKeysInFile(envPath);
  collapseDuplicateKeysInFile(devPath);
  console.log(`  ${files.env.label}: ${envResult} ${key}`);
  console.log(`  ${files.devVars.label}: ${devResult} ${key}`);
}
