#!/usr/bin/env node
/**
 * Merge missing keys from *.example files, or sync secrets .env* → .dev.vars*.
 *
 *   npm run env:merge
 *   npm run env:merge -- --env local|staging|production
 *   npm run env:sync
 *   npm run env:sync -- --env staging
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expandEnvNames, filesFor, takeEnvFlag } from "./env-paths.mjs";
import { collapseDuplicateKeysInFile } from "./env-file.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const SYNC_KEYS = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "RESEND_API_KEY",
  "DEMO_EMAIL",
  "DEMO_PASSWORD",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_MONTHLY",
  "STRIPE_PRICE_YEARLY",
];

/** @param {string} content */
function parseEnvKeys(content) {
  /** @type {Set<string>} */
  const keys = new Set();
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (m) keys.add(m[1]);
  }
  return keys;
}

/**
 * @param {string} content
 * @returns {Record<string, string>}
 */
function parseEnvValues(content) {
  /** @type {Record<string, string>} */
  const values = {};
  for (const line of content.split("\n")) {
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

/** @param {string} value */
function quoteEnvValue(value) {
  if (/[\s#"']/.test(value)) return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  return value;
}

/**
 * @param {string} exampleContent
 * @param {string} destContent
 */
function mergeEnvContent(exampleContent, destContent) {
  const destKeys = parseEnvKeys(destContent);
  /** @type {string[]} */
  const additions = [];
  /** @type {string[]} */
  const pendingComments = [];

  for (const line of exampleContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || trimmed === "") {
      pendingComments.push(line);
      continue;
    }

    const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) {
      pendingComments.push(line);
      continue;
    }

    const [, key] = m;
    if (destKeys.has(key)) {
      pendingComments.length = 0;
      continue;
    }

    if (additions.length === 0 && pendingComments.length > 0) {
      additions.push(...pendingComments);
    }
    additions.push(line);
    destKeys.add(key);
    pendingComments.length = 0;
  }

  if (additions.length === 0) return { content: destContent, added: 0 };

  const header = "\n# --- Added from example (npm run env:merge) ---\n";
  return {
    content: `${destContent.trimEnd()}${header}${additions.join("\n")}\n`,
    added: additions.filter((l) => /^[A-Za-z_]/.test(l.trim())).length,
  };
}

/**
 * @param {string} content
 * @param {Record<string, string | undefined>} values
 */
function applyEnvValues(content, values) {
  const nl = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content.length ? content.split(/\r?\n/) : [];
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  const seen = new Set();

  const updated = [];
  for (const line of lines) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) {
      updated.push(line);
      continue;
    }
    const [, key] = m;
    if (seen.has(key)) continue;
    seen.add(key);
    const next = values[key];
    if (next === undefined || next === "") {
      updated.push(line);
      continue;
    }
    updated.push(`${key}=${quoteEnvValue(next)}`);
  }

  for (const [key, value] of Object.entries(values)) {
    if (value && !seen.has(key)) {
      updated.push(`${key}=${quoteEnvValue(value)}`);
      seen.add(key);
    }
  }

  return updated.length ? `${updated.join(nl)}${nl}` : "";
}

/**
 * @param {{ dest: string, example: string, label: string }} spec
 */
function mergeFile(spec) {
  const dest = resolve(root, spec.dest);
  const example = resolve(root, spec.example);
  if (!existsSync(example)) {
    console.error(`Missing template: ${spec.example}`);
    process.exit(1);
  }

  if (!existsSync(dest)) {
    copyFileSync(example, dest);
    console.log(`  Created ${spec.label} from ${spec.example}.`);
    return parseEnvKeys(readFileSync(example, "utf8")).size;
  }

  const { content, added } = mergeEnvContent(
    readFileSync(example, "utf8"),
    readFileSync(dest, "utf8"),
  );
  if (added === 0) {
    console.log(`  ${spec.label} is up to date - no new keys from example.`);
    return 0;
  }
  writeFileSync(dest, content, "utf8");
  console.log(`  Merged ${added} new key(s) into ${spec.label}.`);
  return added;
}

/** @param {import("./env-paths.mjs").EnvName} name */
function mergeEnv(name) {
  const files = filesFor(name);
  console.log(`\n[${name}]`);
  mergeFile(files.env);
  mergeFile(files.devVars);
}

/** @param {import("./env-paths.mjs").EnvName} name */
function syncEnv(name) {
  mergeEnv(name);
  const files = filesFor(name);
  const envPath = resolve(root, files.env.dest);
  const destPath = resolve(root, files.devVars.dest);
  if (!existsSync(envPath)) {
    console.error(`  ${files.env.label} is missing.`);
    process.exit(1);
  }

  const fromEnv = parseEnvValues(readFileSync(envPath, "utf8"));
  /** @type {Record<string, string | undefined>} */
  const values = {};
  for (const key of SYNC_KEYS) values[key] = fromEnv[key];

  const destContent = existsSync(destPath) ? readFileSync(destPath, "utf8") : "";
  writeFileSync(destPath, applyEnvValues(destContent, values), "utf8");
  collapseDuplicateKeysInFile(destPath);
  const synced = Object.entries(values)
    .filter(([, v]) => v)
    .map(([k]) => k);
  console.log(
    synced.length
      ? `  Synced ${synced.join(", ")} from ${files.env.label} → ${files.devVars.label}.`
      : `  ${files.devVars.label} unchanged - set values in ${files.env.label} first.`,
  );
}

function main() {
  const action = process.argv[2];
  const hasExplicit = process.argv.includes("--env") || Boolean(process.env.LOCATIONS_ENV);
  const { name } = takeEnvFlag(process.argv.slice(3));
  const names = expandEnvNames(hasExplicit ? name : "all");

  if (action === "merge") {
    for (const n of names) mergeEnv(n);
    return;
  }
  if (action === "sync") {
    for (const n of names) syncEnv(n);
    return;
  }
  console.error("Usage: node scripts/env.mjs <merge|sync> [--env local|staging|production|all]");
  process.exit(1);
}

main();
