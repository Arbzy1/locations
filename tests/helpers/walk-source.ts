import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "coverage",
  ".git",
  ".wrangler",
  "legacy",
]);

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

export function walkSourceFiles(root: string, dirs: string[]): WalkedFile[] {
  const out: WalkedFile[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      if (SKIP_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      const lower = entry.toLowerCase();
      const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".")) : "";
      if (!TEXT_EXT.has(ext) && entry !== "wrangler.toml") continue;
      const rel = relative(root, full).replace(/\\/g, "/");
      if (rel.includes("/.cursor/rules/") || rel.endsWith("CLAUDE.md")) continue;
      out.push({ abs: full, rel, text: readFileSync(full, "utf8") });
    }
  }
  for (const dir of dirs) walk(join(root, dir));
  return out;
}
