/**
 * Bots constantly probe for WordPress, PHP and leaked config files. None exist here, but
 * the single-page fallback answered them 200 with index.html, which tells scanners the
 * path is live and keeps them coming. Such paths get a plain 404 instead.
 */

/** File types this app never serves. */
const SCRIPT_EXTENSIONS = /\.(php\d?|phtml|asp|aspx|jsp|jspx|cgi|pl|cfm|sh|bak|sql|ini|log|env)$/i;

/** Prefixes from common CMS, admin-panel and router exploit kits. */
const PROBE_PREFIXES = [
  "/wp-",
  "/wordpress",
  "/xmlrpc",
  "/phpmyadmin",
  "/pma",
  "/myadmin",
  "/cgi-bin",
  "/vendor/",
  "/boaform",
  "/actuator",
  "/owa/",
  "/autodiscover",
  "/solr/",
  "/hnap1",
];

/** True when a path is an attack probe rather than an app page or static file. */
export function isProbePath(pathname: string): boolean {
  let path: string;
  try {
    path = decodeURIComponent(pathname).toLowerCase();
  } catch {
    return true; // malformed escapes are never a real page
  }
  if (SCRIPT_EXTENSIONS.test(path)) return true;
  // Dotfiles and dot-directories (/.env, /.git/config, /.aws/credentials), except the
  // standard /.well-known/ namespace.
  if (/\/\.(?!well-known\/)[^/]/.test(path)) return true;
  return PROBE_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/** The response for a probe: short, uncacheable by shared caches, nothing to fingerprint. */
export function probeNotFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
