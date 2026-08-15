/**
 * Classify Vitest JSON and render reports/test-report.md.
 * No shebang: unit tests import this module.
 */

const VENDOR_DOMAINS = [
  "billing",
  "auth",
  "email",
  "import",
  "health",
  "places",
  "security",
];

const HISTOGRAM_BUCKETS = [
  { id: "lt1", label: "<1ms", max: 1 },
  { id: "1to5", label: "1-5ms", max: 5 },
  { id: "5to20", label: "5-20ms", max: 20 },
  { id: "20to50", label: "20-50ms", max: 50 },
  { id: "50plus", label: "50ms+", max: Infinity },
];

/** @param {string} filePath */
export function classifyTestFile(filePath) {
  const rel = String(filePath ?? "").replace(/\\/g, "/");
  const marker = "/tests/";
  const idx = rel.lastIndexOf(marker);
  const fromTests = idx === -1 ? (rel.startsWith("tests/") ? rel : `tests/${rel}`) : rel.slice(idx + 1);
  const m = fromTests.match(/^tests\/(unit|integration|rls|e2e)\/(.+)$/);
  if (!m) {
    return { kind: "other", layer: "other", domain: "other", file: fromTests };
  }
  const tree = m[1];
  const rest = m[2];
  const parts = rest.split("/").filter(Boolean);
  const security =
    parts[0] === "security" || (parts[0] === "api" && parts[1] === "security");
  /** @type {"unit" | "integration" | "security" | "other"} */
  let kind = "other";
  if (security) kind = "security";
  else if (tree === "unit" || tree === "integration") kind = tree;

  /** @type {string} */
  let layer = "other";
  /** @type {string} */
  let domain = "other";
  if (tree === "rls") {
    layer = "rls";
    domain = parts[0] ?? "rls";
    kind = "other";
  } else if (tree === "e2e") {
    layer = "e2e";
    domain = parts[0] ?? "e2e";
    kind = "other";
  } else if (security) {
    layer = "api";
    domain = "security";
  } else if (["api", "db", "web", "scripts"].includes(parts[0])) {
    layer = parts[0];
    domain = parts[1] ? stripTestSuffix(parts[1]) : parts[0];
  } else {
    domain = stripTestSuffix(parts[0] ?? "other");
  }

  return { kind, layer, domain, file: fromTests };
}

/** @param {string} name */
function stripTestSuffix(name) {
  return name.replace(/\.(test|spec)\.(ts|tsx|js|jsx)$/i, "");
}

/** @param {number} ratio @param {number} [width] */
export function meter(ratio, width = 20) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
  const filled = Math.round(clamped * width);
  return `${"█".repeat(filled)}${"░".repeat(width - filled)}`;
}

/** @param {number[]} sorted @param {number} p */
export function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx] ?? 0;
}

/** @param {number} ms */
export function formatMs(ms) {
  const n = Number(ms) || 0;
  if (n < 10) return `${n.toFixed(2)}ms`;
  if (n < 1000) return `${n.toFixed(1)}ms`;
  return `${(n / 1000).toFixed(2)}s`;
}

/** @param {number} n @param {number} [digits] */
export function formatPct(n, digits = 1) {
  return `${((Number(n) || 0) * 100).toFixed(digits)}%`;
}

/**
 * @param {unknown} payload
 */
export function summarize(payload) {
  const data = payload && typeof payload === "object" ? payload : {};
  /** @type {Array<{ name?: string, assertionResults?: Array<{ fullName?: string, title?: string, status?: string, duration?: number, failureMessages?: string[] }> }>} */
  const suites = Array.isArray(data.testResults) ? data.testResults : [];

  /** @type {Array<{ file: string, kind: string, layer: string, domain: string, title: string, fullName: string, status: string, duration: number, failureMessages: string[] }>} */
  const tests = [];
  /** @type {Map<string, { file: string, kind: string, layer: string, domain: string, tests: number, passed: number, failed: number, pending: number, duration: number }>} */
  const files = new Map();
  /** @type {Record<string, { tests: number, passed: number, failed: number, pending: number, duration: number }>} */
  const byKind = emptyGroups(["unit", "integration", "security", "other"]);
  /** @type {Record<string, { tests: number, passed: number, failed: number, pending: number, duration: number }>} */
  const byLayer = emptyGroups(["api", "db", "web", "scripts", "rls", "e2e", "other"]);
  /** @type {Record<string, { tests: number, passed: number, failed: number, pending: number, duration: number }>} */
  const byDomain = {};

  for (const suite of suites) {
    const classified = classifyTestFile(suite.name ?? "");
    const assertions = Array.isArray(suite.assertionResults) ? suite.assertionResults : [];
    const fileKey = classified.file;
    if (!files.has(fileKey)) {
      files.set(fileKey, {
        file: fileKey,
        kind: classified.kind,
        layer: classified.layer,
        domain: classified.domain,
        tests: 0,
        passed: 0,
        failed: 0,
        pending: 0,
        duration: 0,
      });
    }
    const fileRow = files.get(fileKey);
    for (const assertion of assertions) {
      const status = normalizeStatus(assertion.status);
      const duration = Number(assertion.duration) || 0;
      const title = assertion.title || assertion.fullName || "unnamed";
      const fullName = assertion.fullName || title;
      tests.push({
        ...classified,
        title,
        fullName,
        status,
        duration,
        failureMessages: Array.isArray(assertion.failureMessages)
          ? assertion.failureMessages.map(String)
          : [],
      });
      fileRow.tests += 1;
      fileRow.duration += duration;
      bumpOutcome(fileRow, status);
      bumpGroup(byKind, classified.kind, status, duration);
      bumpGroup(byLayer, classified.layer, status, duration);
      if (!byDomain[classified.domain]) {
        byDomain[classified.domain] = emptyCount();
      }
      bumpGroup(byDomain, classified.domain, status, duration);
    }
  }

  const durations = tests.map((t) => t.duration).sort((a, b) => a - b);
  const passed = tests.filter((t) => t.status === "passed").length;
  const failed = tests.filter((t) => t.status === "failed").length;
  const pending = tests.filter((t) => t.status === "pending").length;
  const todo = tests.filter((t) => t.status === "todo").length;
  const total = tests.length || Number(data.numTotalTests) || 0;
  const durationTotal = durations.reduce((a, b) => a + b, 0);

  /** @type {Record<string, number>} */
  const histogram = {};
  for (const bucket of HISTOGRAM_BUCKETS) histogram[bucket.id] = 0;
  for (const ms of durations) {
    const bucket = HISTOGRAM_BUCKETS.find((b) => ms < b.max) ?? HISTOGRAM_BUCKETS[HISTOGRAM_BUCKETS.length - 1];
    histogram[bucket.id] += 1;
  }

  const slowest = [...tests].sort((a, b) => b.duration - a.duration).slice(0, 15);
  const failedTests = tests.filter((t) => t.status === "failed");
  const domainRows = Object.entries(byDomain)
    .map(([domain, row]) => ({ domain, ...row }))
    .sort((a, b) => b.tests - a.tests || a.domain.localeCompare(b.domain));

  const vendor = {};
  for (const domain of VENDOR_DOMAINS) {
    vendor[domain] = byDomain[domain] ? { ...byDomain[domain] } : emptyCount();
  }

  return {
    success: data.success !== false && failed === 0,
    suiteTotals: {
      total: Number(data.numTotalTestSuites) || suites.length,
      passed: Number(data.numPassedTestSuites) || 0,
      failed: Number(data.numFailedTestSuites) || 0,
    },
    tests: total,
    passed: Number(data.numPassedTests) || passed,
    failed: Number(data.numFailedTests) || failed,
    pending: Number(data.numPendingTests) || pending,
    todo: Number(data.numTodoTests) || todo,
    files: [...files.values()].sort((a, b) => a.file.localeCompare(b.file)),
    byKind,
    byLayer,
    byDomain: domainRows,
    vendor,
    durations: {
      total: durationTotal,
      mean: durations.length ? durationTotal / durations.length : 0,
      p50: percentile(durations, 50),
      p95: percentile(durations, 95),
      max: durations.length ? durations[durations.length - 1] : 0,
    },
    histogram,
    histogramBuckets: HISTOGRAM_BUCKETS,
    slowest,
    failedTests,
    startTime: Number(data.startTime) || 0,
  };
}

function emptyCount() {
  return { tests: 0, passed: 0, failed: 0, pending: 0, duration: 0 };
}

/** @param {string[]} keys */
function emptyGroups(keys) {
  /** @type {Record<string, ReturnType<typeof emptyCount>>} */
  const out = {};
  for (const key of keys) out[key] = emptyCount();
  return out;
}

/** @param {string | undefined} status */
function normalizeStatus(status) {
  const s = String(status ?? "passed").toLowerCase();
  if (s === "failed") return "failed";
  if (s === "pending" || s === "skipped") return "pending";
  if (s === "todo") return "todo";
  return "passed";
}

/**
 * @param {{ tests: number, passed: number, failed: number, pending: number, duration: number }} row
 * @param {string} status
 */
function bumpOutcome(row, status) {
  if (status === "failed") row.failed += 1;
  else if (status === "pending") row.pending += 1;
  else if (status !== "todo") row.passed += 1;
}

/**
 * @param {Record<string, { tests: number, passed: number, failed: number, pending: number, duration: number }>} groups
 * @param {string} key
 * @param {string} status
 * @param {number} duration
 */
function bumpGroup(groups, key, status, duration) {
  const row = groups[key] ?? (groups[key] = emptyCount());
  row.tests += 1;
  row.duration += duration;
  bumpOutcome(row, status);
}

/**
 * @param {ReturnType<typeof summarize>} summary
 * @param {{ generated?: string, ok?: boolean }} [opts]
 */
export function renderMarkdown(summary, opts = {}) {
  const generated = opts.generated ?? new Date().toISOString();
  const failedCount = summary.failed;
  const ok = opts.ok ?? (failedCount === 0 && summary.success);
  const passRate = summary.tests ? summary.passed / summary.tests : 0;
  const status = ok ? "PASS" : "FAIL";

  const kindOrder = ["unit", "integration", "security", "other"];
  const kindRows = kindOrder
    .map((kind) => ({ kind, ...summary.byKind[kind] }))
    .filter((row) => row.tests > 0 || row.kind !== "other");

  const topDomains = summary.byDomain.slice(0, 12);
  const kindBar = mermaidBar(
    "Tests by kind",
    kindRows.map((r) => r.kind),
    kindRows.map((r) => r.tests),
  );
  const domainBar = mermaidBar(
    "Top domains",
    topDomains.map((r) => r.domain),
    topDomains.map((r) => r.tests),
  );
  const histBar = mermaidBar(
    "Duration histogram",
    summary.histogramBuckets.map((b) => b.label),
    summary.histogramBuckets.map((b) => summary.histogram[b.id] ?? 0),
  );

  const pieSlices = [
    ["passed", summary.passed],
    ["failed", summary.failed],
    ["pending", summary.pending],
    ["todo", summary.todo],
  ].filter(([, n]) => n > 0);
  if (!pieSlices.length) pieSlices.push(["passed", 0]);

  const filesByKind = {};
  for (const file of summary.files) {
    (filesByKind[file.kind] ??= []).push(file);
  }

  return `# Test report

**${status}** · generated \`${generated}\`

Vitest JSON for **unit**, **integration**, and **security**. Live Postgres (\`rls\`) and Playwright (\`e2e\`) are out of this file.

---

## Table of contents

- [Executive summary](#executive-summary)
- [Outcome mix](#outcome-mix)
- [By kind](#by-kind)
- [By domain](#by-domain)
- [Vendor / product slices](#vendor--product-slices)
- [Speed](#speed)
- [Taxonomy](#taxonomy)
- [Failures](#failures)
- [File inventory](#file-inventory)
- [Notes](#notes)

---

## Executive summary

> Scope of this run (checked items were executed):
>
> - [x] unit
> - [x] integration
> - [x] security
> - [ ] rls (needs \`DATABASE_URL\`)
> - [ ] e2e (needs a running app)

${meter(passRate)} **${formatPct(passRate)}** pass rate

| KPI | Value |
| --- | ---: |
| Result | **${status}** |
| Tests | ${summary.tests} |
| Passed | ${summary.passed} |
| Failed | ${summary.failed} |
| Pending | ${summary.pending} |
| Todo | ${summary.todo} |
| Files | ${summary.files.length} |
| Suites (Vitest) | ${summary.suiteTotals.total} |
| Duration (sum of tests) | ${formatMs(summary.durations.total)} |
| Mean | ${formatMs(summary.durations.mean)} |
| p50 | ${formatMs(summary.durations.p50)} |
| p95 | ${formatMs(summary.durations.p95)} |
| Max | ${formatMs(summary.durations.max)} |

Pass rate
: Share of assertions with status \`passed\`.

Duration
: Sum of per-test \`duration\` from Vitest (not wall-clock spawn time).

p95
: 95th percentile of individual test durations.

---

## Outcome mix

\`\`\`mermaid
pie title Outcome mix
${pieSlices.map(([label, n]) => `  "${label}" : ${n}`).join("\n")}
\`\`\`

| Outcome | Count | Share |
| --- | ---: | ---: |
| passed | ${summary.passed} | ${formatPct(summary.tests ? summary.passed / summary.tests : 0)} |
| failed | ${summary.failed} | ${formatPct(summary.tests ? summary.failed / summary.tests : 0)} |
| pending | ${summary.pending} | ${formatPct(summary.tests ? summary.pending / summary.tests : 0)} |
| todo | ${summary.todo} | ${formatPct(summary.tests ? summary.todo / summary.tests : 0)} |

---

## By kind

${kindBar}

| Kind | Tests | Passed | Failed | Pending | Duration | Pass |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
${kindRows
  .map((row) =>
    tableCountRow(row.kind, row, summary.tests),
  )
  .join("\n")}

Layer mix (api / db / web / scripts):

| Layer | Tests | Passed | Failed | Duration |
| --- | ---: | ---: | ---: | ---: |
${["api", "db", "web", "scripts"]
  .map((layer) => {
    const row = summary.byLayer[layer];
    return `| ${layer} | ${row.tests} | ${row.passed} | ${row.failed} | ${formatMs(row.duration)} |`;
  })
  .join("\n")}

---

## By domain

${domainBar}

| Domain | Tests | Passed | Failed | Duration | Share | Pass bar |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
${summary.byDomain
  .map((row) => {
    const share = summary.tests ? row.tests / summary.tests : 0;
    const rate = row.tests ? row.passed / row.tests : 0;
    return `| \`${row.domain}\` | ${row.tests} | ${row.passed} | ${row.failed} | ${formatMs(row.duration)} | ${formatPct(share)} | \`${meter(rate, 10)}\` ${formatPct(rate, 0)} |`;
  })
  .join("\n")}

---

## Vendor / product slices

Grouped from domain names that map to Stripe, Better Auth, Resend, R2/queues, Neon health, maps, and security scanners.

| Slice | Tests | Passed | Failed | Duration | Pass |
| --- | ---: | ---: | ---: | ---: | --- |
${VENDOR_DOMAINS.map((domain) => {
  const row = summary.vendor[domain];
  const rate = row.tests ? row.passed / row.tests : 0;
  return `| ${domain} | ${row.tests} | ${row.passed} | ${row.failed} | ${formatMs(row.duration)} | \`${meter(rate, 10)}\` ${row.tests ? formatPct(rate, 0) : "n/a"} |`;
}).join("\n")}

---

## Speed

Slowest 15 tests (by Vitest \`duration\`):

| Rank | Duration | Kind | Domain | Test |
| ---: | ---: | --- | --- | --- |
${summary.slowest
  .map(
    (t, i) =>
      `| ${i + 1} | ${formatMs(t.duration)} | ${t.kind} | \`${t.domain}\` | ${escapeTable(t.fullName)} |`,
  )
  .join("\n") || "| | | | | _none_ |"}

Histogram of individual test durations:

${histBar}

| Bucket | Tests |
| --- | ---: |
${summary.histogramBuckets
  .map((b) => `| ${b.label} | ${summary.histogram[b.id] ?? 0} |`)
  .join("\n")}

---

## Taxonomy

\`\`\`mermaid
flowchart LR
  testsRoot[tests]
  testsRoot --> unitKind[unit]
  testsRoot --> integrationKind[integration]
  testsRoot --> securityKind[security]
  testsRoot -.-> rlsKind[rls not in this run]
  testsRoot -.-> e2eKind[e2e not in this run]
  unitKind --> unitApi[api]
  unitKind --> unitDb[db]
  unitKind --> unitWeb[web]
  unitKind --> unitScripts[scripts]
  integrationKind --> intApi[api routes]
  securityKind --> secUnit[unit/security]
  securityKind --> secInt[integration/api/security]
\`\`\`

---

## Failures

${renderFailures(summary.failedTests)}

---

## File inventory

${kindOrder
  .filter((kind) => (filesByKind[kind] ?? []).length)
  .map((kind) => renderFileDetails(kind, filesByKind[kind]))
  .join("\n\n")}

---

## Notes

Regenerate with <kbd>npm run test:report</kbd>.

> JSON is written to \`reports/vitest.json\` using a **relative** \`--outputFile\` so Windows paths that contain a space (this repo lives under \`Location History\`) are not split into a Vitest filter.

What this file does not include:

- \`npm run test:rls\` (live FORCE RLS against Neon)
- \`npm run test:e2e\` (Playwright against a running Worker)
- \`npm audit\` / placement lint (see \`npm run test:security\` for those)

[^1]: Pass rate uses assertion counts, not suite counts.
[^2]: Domain is the folder under \`tests/{kind}/{layer}/\` (for example \`billing\` in \`tests/integration/api/billing\`).
[^3]: Security tests live in \`tests/unit/security\` and \`tests/integration/api/security\` and are a separate Vitest project.
`;
}

/**
 * @param {string} title
 * @param {string[]} labels
 * @param {number[]} values
 */
function mermaidBar(title, labels, values) {
  if (!labels.length) {
    return "_No data._";
  }
  const max = Math.max(1, ...values);
  const x = labels.map((l) => `"${String(l).replace(/"/g, "")}"`).join(", ");
  const y = values.map((n) => Number(n) || 0).join(", ");
  return `\`\`\`mermaid
xychart-beta
  title "${title.replace(/"/g, "")}"
  x-axis [${x}]
  y-axis "count" 0 --> ${max}
  bar [${y}]
\`\`\``;
}

/**
 * @param {string} name
 * @param {{ tests: number, passed: number, failed: number, pending: number, duration: number }} row
 * @param {number} totalTests
 */
function tableCountRow(name, row, totalTests) {
  const rate = row.tests ? row.passed / row.tests : 0;
  const share = totalTests ? row.tests / totalTests : 0;
  return `| ${name} | ${row.tests} | ${row.passed} | ${row.failed} | ${row.pending} | ${formatMs(row.duration)} | \`${meter(rate, 10)}\` ${formatPct(rate, 0)} (${formatPct(share, 0)} of run) |`;
}

/** @param {string} text */
function escapeTable(text) {
  return String(text).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

/** @param {Array<{ fullName: string, file: string, duration: number, failureMessages: string[] }>} failed */
function renderFailures(failed) {
  if (!failed.length) {
    return "None. Every assertion in this JSON run passed.";
  }
  return failed
    .map((t, i) => {
      const stack = (t.failureMessages.join("\n") || "No failure message.").slice(0, 4000);
      return `<details>
<summary>${i + 1}. ${escapeHtml(t.fullName)}</summary>

- File: \`${t.file}\`
- Duration: ${formatMs(t.duration)}

\`\`\`text
${stack}
\`\`\`

</details>`;
    })
    .join("\n\n");
}

/** @param {string} kind @param {Array<{ file: string, tests: number, passed: number, failed: number, duration: number }>} files */
function renderFileDetails(kind, files) {
  const rows = files
    .map(
      (f) =>
        `| \`${f.file}\` | ${f.tests} | ${f.passed} | ${f.failed} | ${formatMs(f.duration)} |`,
    )
    .join("\n");
  return `<details>
<summary>${kind} (${files.length} files)</summary>

| File | Tests | Passed | Failed | Duration |
| --- | ---: | ---: | ---: | ---: |
${rows}

</details>`;
}

/** @param {string} text */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
