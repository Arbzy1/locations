import type { ApiRoute } from "./api-route-catalog";

function staffGet(path: string, samplePath = path): ApiRoute {
  return {
    method: "GET",
    path,
    samplePath,
    auth: "session",
    demo: "allow",
    idScope: "none",
    rateLimited: false,
    staffOnly: true,
  };
}

function staffMut(
  method: "POST" | "PATCH",
  path: string,
  samplePath = path,
): ApiRoute {
  return {
    method,
    path,
    samplePath,
    auth: "session",
    demo: "allow",
    idScope: "none",
    rateLimited: true,
    staffOnly: true,
  };
}

/** Every /api/admin route. Drift vs apps/api/src/admin.ts fails test:admin. */
export const ADMIN_ROUTE_CATALOG: ApiRoute[] = [
  staffGet("/api/admin/stats"),
  staffGet("/api/admin/overview"),
  staffGet("/api/admin/flags"),
  staffMut("PATCH", "/api/admin/flags"),
  staffMut("POST", "/api/admin/flags/reset"),
  staffGet("/api/admin/users", "/api/admin/users?limit=1"),
  staffMut("POST", "/api/admin/users"),
  staffGet("/api/admin/users/:id", "/api/admin/users/user-a"),
  staffMut("POST", "/api/admin/users/:id/role", "/api/admin/users/missing-id/role"),
  staffMut("POST", "/api/admin/users/:id/revoke-sessions", "/api/admin/users/missing-id/revoke-sessions"),
  staffMut("POST", "/api/admin/users/:id/verify", "/api/admin/users/missing-id/verify"),
  staffMut("POST", "/api/admin/users/:id/send-reset", "/api/admin/users/missing-id/send-reset"),
  staffMut("POST", "/api/admin/users/:id/wipe", "/api/admin/users/missing-id/wipe"),
  staffGet("/api/admin/billing"),
  staffGet("/api/admin/imports"),
  staffMut("POST", "/api/admin/imports/:userId/jobs/:jobId/fail", "/api/admin/imports/missing-id/jobs/job-1/fail"),
  staffGet("/api/admin/exports"),
  staffMut("POST", "/api/admin/exports/:userId/jobs/:jobId/fail", "/api/admin/exports/missing-id/jobs/job-1/fail"),
  staffGet("/api/admin/email"),
  staffMut("POST", "/api/admin/email/test"),
  staffGet("/api/admin/maps/probe"),
  staffGet("/api/admin/maps"),
  staffGet("/api/admin/demo"),
  staffGet("/api/admin/analytics"),
  staffGet("/api/admin/audit"),
  staffGet("/api/admin/diagnostics"),
];

export const ADMIN_GET_ROUTES = ADMIN_ROUTE_CATALOG.filter((r) => r.method === "GET");
export const ADMIN_MUTATION_ROUTES = ADMIN_ROUTE_CATALOG.filter((r) => r.method !== "GET");

export function parseAdminHonoRoutes(source: string): { method: string; path: string }[] {
  const found: { method: string; path: string }[] = [];
  const literal = /app\.(get|post|patch|delete|all)\(\s*(['"`])(\/api\/admin\/[^'"`]+)\2/g;
  for (const match of source.matchAll(literal)) {
    found.push({ method: match[1].toUpperCase(), path: match[3] });
  }
  return found;
}
