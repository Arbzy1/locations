/**
 * Shared .env / .dev.vars read-write helpers.
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { filesFor } from "./env-paths.mjs";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** CLI-only keys that never go to the Worker. */
export const LOCAL_ONLY_KEYS = ["DATA_PATH"];

/**
 * Parse plaintext `[vars]` / `[env.*.vars]` keys from wrangler.toml.
 * Those deploy with the Worker and must not be uploaded as secrets.
 *
 * @param {string} toml
 * @returns {Set<string>}
 */
export function parseWranglerPlaintextVarKeys(toml) {
  /** @type {Set<string>} */
  const keys = new Set();
  let inVars = false;
  for (const line of toml.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[")) {
      inVars = /^\[(?:env\.[^.]+\.)?vars\]$/.test(trimmed);
      continue;
    }
    if (!inVars || !trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (m) keys.add(m[1]);
  }
  return keys;
}

/**
 * Worker secret names: env-example keys minus wrangler.toml vars and CLI-only keys.
 *
 * @param {{ envExampleKeys: Iterable<string>, wranglerVarKeys: Iterable<string> }} input
 * @returns {string[]}
 */
export function deriveWorkerSecretKeys({ envExampleKeys, wranglerVarKeys }) {
  const skip = new Set([...wranglerVarKeys, ...LOCAL_ONLY_KEYS]);
  return [...new Set(envExampleKeys)].filter((key) => !skip.has(key)).sort();
}

/**
 * Keys uploaded with `wrangler secret bulk`.
 * Derived from `.env*.example` so new secrets are picked up without a hardcoded list.
 */
export function loadWorkerSecretKeys() {
  const wranglerPath = resolve(repoRoot, "wrangler.toml");
  const envExampleKeys = [
    ".env.example",
    ".env.staging.example",
    ".env.production.example",
  ].flatMap((file) => Object.keys(readEnvFile(resolve(repoRoot, file))));
  const wranglerVarKeys = existsSync(wranglerPath)
    ? parseWranglerPlaintextVarKeys(readFileSync(wranglerPath, "utf8"))
    : [];
  return deriveWorkerSecretKeys({ envExampleKeys, wranglerVarKeys });
}

export const WORKER_SECRET_KEYS = loadWorkerSecretKeys();

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

/**
 * Upsert filled secrets and delete remote keys we no longer manage.
 * Blank local values are left unchanged on Cloudflare.
 *
 * @param {{ secrets: Record<string, string>, remoteNames: string[], managedKeys?: Iterable<string> }} input
 * @returns {{ payload: Record<string, string | null>, pruned: string[] }}
 */
export function secretBulkPayload({ secrets, remoteNames, managedKeys = WORKER_SECRET_KEYS }) {
  /** @type {Record<string, string | null>} */
  const payload = { ...secrets };
  const managed = new Set(managedKeys);
  /** @type {string[]} */
  const pruned = [];
  for (const remote of remoteNames) {
    if (managed.has(remote)) continue;
    payload[remote] = null;
    pruned.push(remote);
  }
  pruned.sort();
  return { payload, pruned };
}

/** @param {string} stdout */
export function parseSecretListOutput(stdout) {
  const text = String(stdout ?? "").trim();
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1) return [];
  const parsed = JSON.parse(text.slice(start, end + 1));
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((row) => (row && typeof row.name === "string" ? row.name : ""))
    .filter(Boolean);
}
