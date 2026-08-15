import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "coverage",
  ".git",
  ".wrangler",
  ".vite",
  ".tmp",
  "legacy",
  "reports",
  "playwright-report",
  "test-results",
]);

const SKIP_FILES = new Set(["package-lock.json", "tsconfig.tsbuildinfo"]);

const TEXT_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".toml",
  ".md",
  ".html",
  ".css",
]);

export type WalkedFile = { abs: string; rel: string; text: string };

export function walkSourceFiles(
  root: string,
  dirs: string[],
  opts: { extensions?: Iterable<string> } = {},
): WalkedFile[] {
  const allowExt = opts.extensions ? new Set(opts.extensions) : TEXT_EXT;
  const out: WalkedFile[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      if (SKIP_DIRS.has(entry)) continue;
      if (SKIP_FILES.has(entry)) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      const lower = entry.toLowerCase();
      const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".")) : "";
      if (!allowExt.has(ext) && entry !== "wrangler.toml") continue;
      const rel = relative(root, full).replace(/\\/g, "/");
      if (rel.includes("/.cursor/rules/") || rel.endsWith("CLAUDE.md")) continue;
      out.push({ abs: full, rel, text: readFileSync(full, "utf8") });
    }
  }
  for (const dir of dirs) walk(join(root, dir));
  return out;
}
