#!/usr/bin/env node
/**
 * Run unit + integration + security tests and write reports/test-report.md.
 *
 *   npm run test:report
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderMarkdown, summarize } from "./test-report-render.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const reportsDir = join(root, "reports");
// Relative path: `cwd` is repo root. An absolute `--outputFile=...` breaks on
// Windows when the repo path contains a space (`Location History`).
const jsonRel = "reports/vitest.json";
const jsonPath = join(reportsDir, "vitest.json");
const mdPath = join(reportsDir, "test-report.md");

mkdirSync(reportsDir, { recursive: true });

const result = spawnSync(
  "npx",
  [
    "vitest",
    "run",
    "--project",
    "unit",
    "--project",
    "integration",
    "--project",
    "security",
    "--reporter=default",
    "--reporter=json",
    "--outputFile",
    jsonRel,
  ],
  {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);

/** @type {Record<string, unknown>} */
let payload = {};
try {
  payload = JSON.parse(readFileSync(jsonPath, "utf8"));
} catch {
  payload = {};
}

const summary = summarize(payload);
const generated = new Date().toISOString();
const ok = summary.failed === 0 && (result.status ?? 1) === 0;
const markdown = renderMarkdown(summary, { generated, ok });

writeFileSync(mdPath, markdown, "utf8");
console.log(`\nWrote reports/test-report.md (${ok ? "pass" : "fail"})`);
process.exit(result.status ?? (ok ? 0 : 1));
