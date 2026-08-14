#!/usr/bin/env node
/**
 * Fail if test files live outside tests/{unit,integration,rls,e2e} or in the wrong kind folder.
 *
 *   npm run test:placement
 */
import { readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "coverage",
  ".git",
  ".wrangler",
  "playwright-report",
  "test-results",
  "legacy",
  "reports",
]);

const TEST_RE = /\.(test|spec)\.(ts|tsx|js|jsx)$/;

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walk(full);
    } else {
      yield full;
    }
  }
}

/** @param {string} rel */
function violation(rel) {
  if (!TEST_RE.test(rel)) return null;
  if (rel.startsWith("tests/helpers/") || rel.startsWith("tests/fixtures/")) {
    return `${rel}: helpers and fixtures must not contain test files`;
  }
  if (rel.startsWith("tests/e2e/")) {
    if (!rel.endsWith(".spec.ts") && !rel.endsWith(".spec.tsx")) {
      return `${rel}: Playwright files must be *.spec.ts under tests/e2e/`;
    }
    return null;
  }
  if (rel.startsWith("tests/unit/") || rel.startsWith("tests/integration/") || rel.startsWith("tests/rls/")) {
    if (!rel.endsWith(".test.ts") && !rel.endsWith(".test.tsx")) {
      return `${rel}: Vitest files must be *.test.ts under tests/{unit,integration,rls}/`;
    }
    return null;
  }
  if (rel.startsWith("tests/")) {
    return `${rel}: test files belong in tests/{unit,integration,rls,e2e}/`;
  }
  return `${rel}: tests must live under tests/ (see tests/README.md)`;
}

const errors = [];
for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  if (extname(file) && !TEST_RE.test(rel)) continue;
  const problem = violation(rel);
  if (problem) errors.push(problem);
}

if (errors.length > 0) {
  console.error("test:placement failed:\n");
  for (const line of errors) console.error(`  ${line}`);
  console.error("\nPlace tests using the map in tests/README.md.");
  process.exit(1);
}

console.log("test:placement ok");
