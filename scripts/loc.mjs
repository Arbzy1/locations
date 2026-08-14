#!/usr/bin/env node
/**
 * Lines-of-code report.
 *
 *   npm run loc
 *   npm run loc:report
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
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

const SKIP_FILES = new Set(["package-lock.json"]);

const CODE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".css",
  ".html",
  ".json",
  ".toml",
  ".yml",
  ".yaml",
  ".sql",
]);

const DOC_EXTENSIONS = new Set([".md", ".mdc"]);

/** @typedef {{ files: number, total: number, blank: number, comment: number, code: number }} LineStats */

function emptyStats() {
  return { files: 0, total: 0, blank: 0, comment: 0, code: 0 };
}

/** @param {LineStats} a @param {LineStats} b */
function mergeStats(a, b) {
  return {
    files: a.files + b.files,
    total: a.total + b.total,
    blank: a.blank + b.blank,
    comment: a.comment + b.comment,
    code: a.code + b.code,
  };
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walk(full);
    } else if (!SKIP_FILES.has(entry)) {
      yield full;
    }
  }
}

/**
 * @param {string} content
 * @param {string} ext
 */
function classifyLines(content, ext) {
  const lines = content.split("\n");
  let blank = 0;
  let comment = 0;
  let code = 0;
  let inBlock = false;
  const isDoc = DOC_EXTENSIONS.has(ext);

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) {
      blank += 1;
      continue;
    }
    if (isDoc) {
      code += 1;
      continue;
    }
    if (inBlock) {
      comment += 1;
      if (trimmed.includes("*/") || trimmed.includes("-->")) inBlock = false;
      continue;
    }
    if ([".ts", ".tsx", ".js", ".mjs", ".css"].includes(ext)) {
      if (trimmed.startsWith("//")) {
        comment += 1;
        continue;
      }
      if (trimmed.startsWith("/*")) {
        comment += 1;
        if (!trimmed.includes("*/")) inBlock = true;
        continue;
      }
    }
    if ([".yml", ".yaml", ".toml", ".sql"].includes(ext) && trimmed.startsWith("#")) {
      comment += 1;
      continue;
    }
    if (ext === ".html" && trimmed.startsWith("<!--")) {
      comment += 1;
      if (!trimmed.includes("-->")) inBlock = true;
      continue;
    }
    code += 1;
  }

  return { total: lines.length, blank, comment, code };
}

/** @param {string} relPath */
function areaFor(relPath) {
  if (relPath.startsWith("apps/web/")) return "apps/web";
  if (relPath.startsWith("apps/api/")) return "apps/api";
  if (relPath.startsWith("packages/db/")) return "packages/db";
  if (relPath.startsWith("scripts/")) return "scripts";
  if (relPath.startsWith("docs/")) return "docs";
  return "other";
}

/** @param {number} part @param {number} whole */
function pct(part, whole) {
  return whole === 0 ? "0.0%" : `${((part / whole) * 100).toFixed(1)}%`;
}

/**
 * @param {string} title
 * @param {Record<string, string | number>[]} rows
 * @param {string[]} keys
 */
function terminalTable(title, rows, keys) {
  const widths = keys.map((key) =>
    Math.max(key.length, ...rows.map((row) => String(row[key] ?? "").length)),
  );
  const rule = `  ${widths.map((w) => "-".repeat(w)).join("  ")}`;
  const out = [`\n${title}`, rule];
  out.push(`  ${keys.map((key, i) => key.padEnd(widths[i])).join("  ")}`);
  out.push(rule);
  for (const row of rows) {
    out.push(`  ${keys.map((key, i) => String(row[key] ?? "").padEnd(widths[i])).join("  ")}`);
  }
  return out.join("\n");
}

/**
 * @param {string} title
 * @param {Record<string, string | number>[]} rows
 * @param {{ label: string, key: string }[]} columns
 */
function markdownTable(title, rows, columns) {
  const header = `| ${columns.map((c) => c.label).join(" | ")} |`;
  const sep = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map(
    (row) => `| ${columns.map((c) => String(row[c.key] ?? "")).join(" | ")} |`,
  );
  return [`## ${title}`, "", header, sep, ...body].join("\n");
}

const writeReport = process.argv.includes("--report");

/** @type {Map<string, LineStats>} */
const byArea = new Map();
/** @type {Map<string, LineStats>} */
const byExt = new Map();
const grand = emptyStats();

for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  const ext = extname(file) || "(none)";
  if (!CODE_EXTENSIONS.has(ext) && !DOC_EXTENSIONS.has(ext)) continue;

  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (content.includes("\0")) continue;

  const classified = classifyLines(content, ext);
  const stats = { files: 1, ...classified };
  const area = areaFor(rel);
  byArea.set(area, mergeStats(byArea.get(area) ?? emptyStats(), stats));
  byExt.set(ext, mergeStats(byExt.get(ext) ?? emptyStats(), stats));
  Object.assign(grand, mergeStats(grand, stats));
}

const areaRows = [...byArea.entries()]
  .map(([area, s]) => ({
    area,
    files: s.files,
    code: s.code,
    comment: s.comment,
    blank: s.blank,
    total: s.total,
    codePct: pct(s.code, s.total),
  }))
  .sort((a, b) => b.code - a.code);

const extRows = [...byExt.entries()]
  .map(([ext, s]) => ({
    ext,
    files: s.files,
    code: s.code,
    comment: s.comment,
    blank: s.blank,
    total: s.total,
  }))
  .sort((a, b) => b.code - a.code);

console.log("\nLocations lines of code\n");
console.log(`  Files        ${grand.files}`);
console.log(`  Total lines  ${grand.total}`);
console.log(`  Code         ${grand.code}  (${pct(grand.code, grand.total)} of total)`);
console.log(`  Comments     ${grand.comment}`);
console.log(`  Blank        ${grand.blank}`);
console.log(terminalTable("By area", areaRows, ["area", "files", "code", "comment", "blank", "codePct"]));
console.log(terminalTable("By extension", extRows, ["ext", "files", "code", "comment", "blank"]));
console.log("");

if (writeReport) {
  const generated = new Date().toISOString();
  const markdown = `# Lines of code report

Generated: ${generated}

## Summary

| Metric | Count |
| --- | ---: |
| Files | ${grand.files} |
| Total lines | ${grand.total} |
| Code lines | ${grand.code} |
| Comment lines | ${grand.comment} |
| Blank lines | ${grand.blank} |
| Code % | ${pct(grand.code, grand.total)} |

${markdownTable("By area", areaRows, [
  { label: "Area", key: "area" },
  { label: "Files", key: "files" },
  { label: "Code", key: "code" },
  { label: "Comments", key: "comment" },
  { label: "Blank", key: "blank" },
  { label: "Code %", key: "codePct" },
])}

${markdownTable("By extension", extRows, [
  { label: "Ext", key: "ext" },
  { label: "Files", key: "files" },
  { label: "Code", key: "code" },
  { label: "Comments", key: "comment" },
  { label: "Blank", key: "blank" },
])}

Regenerate with \`npm run loc:report\`.
`;
  const out = join(ROOT, "reports", "loc.md");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, markdown, "utf8");
  console.log(`Wrote reports/loc.md`);
}
