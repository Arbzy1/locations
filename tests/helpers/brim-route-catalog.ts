import type { ApiRoute } from "./api-route-catalog";

const OTHER = "other-tenant-id";

function read(path: string, samplePath = path, idScope: ApiRoute["idScope"] = "none", rateLimited = false): ApiRoute {
  return { method: "GET", path, samplePath, auth: "session", demo: "allow", idScope, rateLimited };
}

/** Compute-only POSTs (estimate, lookups). Demo may use them; they never persist tenant rows. */
function compute(path: string, rateLimited: boolean): ApiRoute {
  return { method: "POST", path, samplePath: path, auth: "session", demo: "allow", idScope: "none", rateLimited };
}

function write(
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  samplePath = path,
  idScope: ApiRoute["idScope"] = "none",
): ApiRoute {
  return { method, path, samplePath, auth: "session", demo: "denyWrite", idScope, rateLimited: false };
}

/** Every /api/brim (journey cost) route. Drift vs apps/api/src/brim/routes.ts fails test:security. */
export const BRIM_ROUTE_CATALOG: ApiRoute[] = [
  read("/api/brim/status"),
  read("/api/brim/places", "/api/brim/places?q=lo", "none", true),
  compute("/api/brim/places/resolve", true),
  compute("/api/brim/places/reverse", true),
  compute("/api/brim/estimate", true),
  compute("/api/brim/estimate/from-maps-url", true),
  read("/api/brim/stations/near"),
  read("/api/brim/stations/near-route"),
  compute("/api/brim/stations/near-route", false),
  read("/api/brim/meta/prices"),
  read("/api/brim/meta/ev-tariffs"),
  read("/api/brim/zones"),
  read("/api/brim/charges/for-route"),
  compute("/api/brim/charges/for-route", false),

  read("/api/brim/vehicles/catalogue/makes"),
  read("/api/brim/vehicles/catalogue/models"),
  read("/api/brim/vehicles/catalogue"),
  read("/api/brim/vehicles/catalogue/:id", "/api/brim/vehicles/catalogue/unknown"),
  compute("/api/brim/vehicles/resolve", true),
  read("/api/brim/vehicles"),
  write("POST", "/api/brim/vehicles"),
  write("PATCH", "/api/brim/vehicles/:id", `/api/brim/vehicles/${OTHER}`, "tenantRow"),
  write("DELETE", "/api/brim/vehicles/:id", `/api/brim/vehicles/${OTHER}`, "tenantRow"),
  read("/api/brim/vehicles/:id/compliance", `/api/brim/vehicles/${OTHER}/compliance`, "tenantRow"),
  read("/api/brim/vehicles/:id/tariffs", `/api/brim/vehicles/${OTHER}/tariffs`, "tenantRow"),
  write("POST", "/api/brim/vehicles/:id/tariffs", `/api/brim/vehicles/${OTHER}/tariffs`, "tenantRow"),
  read("/api/brim/vehicles/:id/fill-ups", `/api/brim/vehicles/${OTHER}/fill-ups`, "tenantRow"),
  read("/api/brim/vehicles/:id/calibration", `/api/brim/vehicles/${OTHER}/calibration`, "tenantRow"),

  read("/api/brim/settings"),
  write("PATCH", "/api/brim/settings"),
  read("/api/brim/saved-places"),
  write("POST", "/api/brim/saved-places"),
  write("PATCH", "/api/brim/saved-places/:id", `/api/brim/saved-places/${OTHER}`, "tenantRow"),
  write("DELETE", "/api/brim/saved-places/:id", `/api/brim/saved-places/${OTHER}`, "tenantRow"),

  write("POST", "/api/brim/fill-ups"),
  write("DELETE", "/api/brim/fill-ups/:id", `/api/brim/fill-ups/${OTHER}`, "tenantRow"),

  write("POST", "/api/brim/journeys"),
  read("/api/brim/journeys"),
  read("/api/brim/journeys/export"),
  read("/api/brim/journeys/summary"),
  read("/api/brim/journeys/:id", `/api/brim/journeys/${OTHER}`, "tenantRow"),
  write("DELETE", "/api/brim/journeys/:id", `/api/brim/journeys/${OTHER}`, "tenantRow"),
];
