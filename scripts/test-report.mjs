#!/usr/bin/env node
/**
 * Run unit + integration tests and write reports/test-report.md.
 *
 *   npm run test:report
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

/** @type {{ numTotalTests?: number, numPassedTests?: number, numFailedTests?: number, numPendingTests?: number, testResults?: Array<{ name?: string, assertionResults?: Array<{ fullName?: string, title?: string, status?: string, failureMessages?: string[] }> }> }} */
let payload = {};
try {
  payload = JSON.parse(readFileSync(jsonPath, "utf8"));
} catch {
  payload = {};
}

const failed = [];
for (const suite of payload.testResults ?? []) {
  for (const assertion of suite.assertionResults ?? []) {
    if (assertion.status === "failed") {
      failed.push(assertion.fullName || assertion.title || suite.name || "unknown");
    }
  }
}

const total = payload.numTotalTests ?? 0;
const passed = payload.numPassedTests ?? Math.max(0, total - failed.length);
const failedCount = payload.numFailedTests ?? failed.length;
const pending = payload.numPendingTests ?? 0;
const generated = new Date().toISOString();
const ok = failedCount === 0 && (result.status ?? 1) === 0;

const failedSection =
  failed.length === 0
    ? "None."
    : failed.map((name) => `- ${name}`).join("\n");

const markdown = `# Test report

Generated: ${generated}

Unit and integration only (no RLS, no e2e).

## Summary

| Metric | Count |
| --- | ---: |
| Total | ${total} |
| Passed | ${passed} |
| Failed | ${failedCount} |
| Pending | ${pending} |
| Result | ${ok ? "pass" : "fail"} |

## Failed tests

${failedSection}

Regenerate with \`npm run test:report\`.
`;

writeFileSync(mdPath, markdown, "utf8");
console.log(`\nWrote reports/test-report.md (${ok ? "pass" : "fail"})`);
process.exit(result.status ?? (ok ? 0 : 1));
