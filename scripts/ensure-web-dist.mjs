/**
 * Wrangler [assets] needs apps/web/dist to exist. Day-to-day `dev:all` no longer
 * production-builds the SPA, so write a stub index.html when dist is missing.
 * A real `vite build` is left alone.
 *
 *   node scripts/ensure-web-dist.mjs
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const WEB_DIST_DIR = join(root, "apps", "web", "dist");
export const STUB_MARKER = "locations-dev-stub";

export function stubHtml() {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "  <head>",
    '    <meta charset="UTF-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1" />',
    "    <title>Locations API</title>",
    `    <!-- ${STUB_MARKER} -->`,
    "  </head>",
    "  <body>",
    "    <main>",
    "      <h1>API is on this port</h1>",
    "      <p>",
    "        The UI with hot reload is at",
    '        <a href="http://localhost:5173">http://localhost:5173</a>.',
    "      </p>",
    "      <p>",
    "        To browse a production SPA here, run",
    "        <code>npm run dev:e2e</code>",
    "        (typecheck + Vite build, then this Worker).",
    "      </p>",
    "    </main>",
    "  </body>",
    "</html>",
    "",
  ].join("\n");
}

/**
 * @param {string} [dir]
 * @returns {{ wrote: boolean, path: string }}
 */
export function ensureWebDist(dir = WEB_DIST_DIR) {
  const indexPath = join(dir, "index.html");
  if (existsSync(indexPath)) return { wrote: false, path: indexPath };
  mkdirSync(dir, { recursive: true });
  writeFileSync(indexPath, stubHtml(), "utf8");
  return { wrote: true, path: indexPath };
}

function isCli() {
  const invoked = process.argv[1];
  if (!invoked) return false;
  return resolve(invoked) === resolve(fileURLToPath(import.meta.url));
}

if (isCli()) {
  const result = ensureWebDist();
  if (result.wrote) {
    console.log(`  wrote stub SPA at ${result.path}`);
  }
}
