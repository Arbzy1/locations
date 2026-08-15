import { ADMIN_ROUTE_CATALOG } from "./admin-route-catalog";

export type RouteAuth = "public" | "session" | "webhook" | "authHandler";
export type DemoPolicy = "allow" | "denyWrite";
export type IdScope = "none" | "tenantRow" | "job";

export type ApiRoute = {
  method: "GET" | "POST" | "PATCH" | "DELETE" | "ALL";
  path: string;
  samplePath: string;
  auth: RouteAuth;
  demo: DemoPolicy;
  idScope: IdScope;
  rateLimited: boolean;
  staffOnly?: boolean;
};

const ANALYTICS_LOOP_KEYS = [
  "away-nights",
  "commute",
  "firsts",
  "data-health",
  "moving",
  "anomaly",
  "streaks",
  "place-deltas",
  "lapsed-places",
  "hour-of-week",
  "personality",
  "activity-guesses",
  "badges",
] as const;

function analytics(path: string): ApiRoute {
  return {
    method: "GET",
    path,
    samplePath: path,
    auth: "session",
    demo: "allow",
    idScope: "none",
    rateLimited: false,
  };
}

/** Canonical /api/* routes. Drift vs apps/api/src/index.ts fails test:security. */
export const API_ROUTE_CATALOG: ApiRoute[] = [
  { method: "POST", path: "/api/auth/demo", samplePath: "/api/auth/demo", auth: "authHandler", demo: "allow", idScope: "none", rateLimited: true },
  { method: "ALL", path: "/api/auth/*", samplePath: "/api/auth/sign-in/email", auth: "authHandler", demo: "allow", idScope: "none", rateLimited: true },
  { method: "GET", path: "/api/config", samplePath: "/api/config", auth: "public", demo: "allow", idScope: "none", rateLimited: false },
  { method: "GET", path: "/api/me", samplePath: "/api/me", auth: "session", demo: "allow", idScope: "none", rateLimited: false },
  { method: "GET", path: "/api/overview", samplePath: "/api/overview", auth: "session", demo: "allow", idScope: "none", rateLimited: false },
  { method: "GET", path: "/api/days", samplePath: "/api/days", auth: "session", demo: "allow", idScope: "none", rateLimited: false },
  { method: "GET", path: "/api/day/:date", samplePath: "/api/day/2024-01-01", auth: "session", demo: "allow", idScope: "none", rateLimited: false },
  { method: "DELETE", path: "/api/days", samplePath: "/api/days?from=2024-01-01&to=2024-01-02", auth: "session", demo: "denyWrite", idScope: "none", rateLimited: false },
  { method: "GET", path: "/api/heatmap", samplePath: "/api/heatmap", auth: "session", demo: "allow", idScope: "none", rateLimited: false },
  analytics("/api/analytics/monthly"),
  analytics("/api/analytics/yearly"),
  analytics("/api/analytics/day-trips"),
  analytics("/api/analytics/corridors"),
  analytics("/api/analytics/facts"),
  analytics("/api/analytics/multi-day"),
  analytics("/api/analytics/home-work"),
  analytics("/api/analytics/areas"),
  analytics("/api/analytics/year-in-review"),
  analytics("/api/analytics/flights"),
  analytics("/api/analytics/train-hops"),
  analytics("/api/analytics/low-movement"),
  { method: "GET", path: "/api/route-progress", samplePath: "/api/route-progress", auth: "session", demo: "allow", idScope: "none", rateLimited: false },
  { method: "POST", path: "/api/routes/rewarm", samplePath: "/api/routes/rewarm", auth: "session", demo: "denyWrite", idScope: "none", rateLimited: false },
  { method: "GET", path: "/api/place/:placeId", samplePath: "/api/place/probe?lat=51.5&lon=-0.1", auth: "session", demo: "allow", idScope: "none", rateLimited: true },
  { method: "GET", path: "/api/sources", samplePath: "/api/sources", auth: "session", demo: "allow", idScope: "none", rateLimited: false },
  { method: "PATCH", path: "/api/sources/:id", samplePath: "/api/sources/other-tenant-id", auth: "session", demo: "denyWrite", idScope: "tenantRow", rateLimited: false },
  { method: "DELETE", path: "/api/sources/:id", samplePath: "/api/sources/other-tenant-id", auth: "session", demo: "denyWrite", idScope: "tenantRow", rateLimited: false },
  { method: "GET", path: "/api/import/status", samplePath: "/api/import/status", auth: "session", demo: "allow", idScope: "none", rateLimited: false },
  { method: "POST", path: "/api/import/preview", samplePath: "/api/import/preview", auth: "session", demo: "denyWrite", idScope: "none", rateLimited: false },
  { method: "POST", path: "/api/import", samplePath: "/api/import", auth: "session", demo: "denyWrite", idScope: "none", rateLimited: true },
  { method: "GET", path: "/api/search", samplePath: "/api/search?q=park", auth: "session", demo: "allow", idScope: "none", rateLimited: true },
  { method: "GET", path: "/api/clusters", samplePath: "/api/clusters", auth: "session", demo: "allow", idScope: "none", rateLimited: false },
  { method: "GET", path: "/api/clusters/:key/visits", samplePath: "/api/clusters/other-tenant-id/visits", auth: "session", demo: "allow", idScope: "none", rateLimited: false },
  { method: "GET", path: "/api/clusters/:key", samplePath: "/api/clusters/other-tenant-id", auth: "session", demo: "allow", idScope: "tenantRow", rateLimited: false },
  { method: "GET", path: "/api/corridors/:a/:b", samplePath: "/api/corridors/a/b", auth: "session", demo: "allow", idScope: "tenantRow", rateLimited: false },
  { method: "GET", path: "/api/trip-range/:start/:end", samplePath: "/api/trip-range/2024-01-01/2024-01-02", auth: "session", demo: "allow", idScope: "none", rateLimited: false },
  { method: "GET", path: "/api/trips", samplePath: "/api/trips", auth: "session", demo: "allow", idScope: "none", rateLimited: false },
  { method: "POST", path: "/api/trips", samplePath: "/api/trips", auth: "session", demo: "denyWrite", idScope: "none", rateLimited: false },
  { method: "PATCH", path: "/api/trips/:id", samplePath: "/api/trips/other-tenant-id", auth: "session", demo: "denyWrite", idScope: "tenantRow", rateLimited: false },
  { method: "DELETE", path: "/api/trips/:id", samplePath: "/api/trips/other-tenant-id", auth: "session", demo: "denyWrite", idScope: "tenantRow", rateLimited: false },
  { method: "GET", path: "/api/chapters", samplePath: "/api/chapters", auth: "session", demo: "allow", idScope: "none", rateLimited: false },
  { method: "POST", path: "/api/chapters", samplePath: "/api/chapters", auth: "session", demo: "denyWrite", idScope: "none", rateLimited: false },
  { method: "PATCH", path: "/api/chapters/:id", samplePath: "/api/chapters/other-tenant-id", auth: "session", demo: "denyWrite", idScope: "tenantRow", rateLimited: false },
  { method: "DELETE", path: "/api/chapters/:id", samplePath: "/api/chapters/other-tenant-id", auth: "session", demo: "denyWrite", idScope: "tenantRow", rateLimited: false },
  { method: "GET", path: "/api/import/jobs", samplePath: "/api/import/jobs", auth: "session", demo: "allow", idScope: "none", rateLimited: false },
  ...ADMIN_ROUTE_CATALOG,
  ...ANALYTICS_LOOP_KEYS.map((key) => analytics(`/api/analytics/${key}`)),
  { method: "PATCH", path: "/api/account/settings", samplePath: "/api/account/settings", auth: "session", demo: "denyWrite", idScope: "none", rateLimited: false },
  { method: "GET", path: "/api/account/export", samplePath: "/api/account/export", auth: "session", demo: "allow", idScope: "none", rateLimited: false },
  { method: "POST", path: "/api/account/export-pack", samplePath: "/api/account/export-pack", auth: "session", demo: "allow", idScope: "none", rateLimited: true },
  { method: "GET", path: "/api/account/export-pack/:jobId/file", samplePath: "/api/account/export-pack/other-tenant-id/file", auth: "session", demo: "allow", idScope: "job", rateLimited: false },
  { method: "GET", path: "/api/account/export-pack/:jobId", samplePath: "/api/account/export-pack/other-tenant-id", auth: "session", demo: "allow", idScope: "job", rateLimited: false },
  { method: "GET", path: "/api/places/labels", samplePath: "/api/places/labels", auth: "session", demo: "allow", idScope: "none", rateLimited: false },
  { method: "POST", path: "/api/account/delete", samplePath: "/api/account/delete", auth: "session", demo: "denyWrite", idScope: "none", rateLimited: false },
  { method: "PATCH", path: "/api/places/labels", samplePath: "/api/places/labels", auth: "session", demo: "denyWrite", idScope: "none", rateLimited: false },
  { method: "POST", path: "/api/billing/checkout", samplePath: "/api/billing/checkout", auth: "session", demo: "denyWrite", idScope: "none", rateLimited: true },
  { method: "POST", path: "/api/billing/portal", samplePath: "/api/billing/portal", auth: "session", demo: "denyWrite", idScope: "none", rateLimited: true },
  { method: "POST", path: "/api/billing/webhook", samplePath: "/api/billing/webhook", auth: "webhook", demo: "allow", idScope: "none", rateLimited: false },
  { method: "GET", path: "/api/health", samplePath: "/api/health", auth: "public", demo: "allow", idScope: "none", rateLimited: false },
];

export const PUBLIC_API_PREFIXES = ["/api/health", "/api/config", "/api/auth/", "/api/billing/webhook"] as const;

export function parseHonoApiRoutes(source: string): { method: string; path: string }[] {
  const found: { method: string; path: string }[] = [];
  const literal = /app\.(get|post|patch|delete|all)\(\s*(['"`])(\/api\/[^'"`]+)\2/g;
  for (const match of source.matchAll(literal)) {
    if (match[3].includes("${")) continue;
    found.push({ method: match[1].toUpperCase(), path: match[3] });
  }
  const loopKeys: string[] = [];
  const loop = source.match(/for \(const key of \[([\s\S]*?)\] as const\)/);
  if (loop) {
    for (const key of loop[1].matchAll(/"([^"]+)"/g)) {
      loopKeys.push(key[1]);
    }
  }
  for (const key of loopKeys) {
    found.push({ method: "GET", path: `/api/analytics/${key}` });
  }
  return found;
}

export function catalogRouteKeys(routes: ApiRoute[] = API_ROUTE_CATALOG): Set<string> {
  return new Set(routes.map((r) => `${r.method} ${r.path}`));
}
