import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  API_ROUTE_CATALOG,
  catalogRouteKeys,
  parseHonoApiRoutes,
  PUBLIC_API_PREFIXES,
} from "@tests/helpers/api-route-catalog";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const indexSource = readFileSync(join(root, "apps/api/src/index.ts"), "utf8");

describe("API route catalog", () => {
  it("matches every Hono /api route in apps/api/src/index.ts", () => {
    const parsed = parseHonoApiRoutes(indexSource);
    const fromSource = new Set(parsed.map((r) => `${r.method} ${r.path}`));
    const fromCatalog = catalogRouteKeys();
    const missing = [...fromSource].filter((k) => !fromCatalog.has(k)).sort();
    const extra = [...fromCatalog].filter((k) => !fromSource.has(k)).sort();
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
  });

  it("keeps the public allowlist tiny", () => {
    const publicRoutes = API_ROUTE_CATALOG.filter((r) => r.auth === "public" || r.auth === "webhook" || r.auth === "authHandler");
    for (const route of publicRoutes) {
      const ok = PUBLIC_API_PREFIXES.some(
        (prefix) => route.path === prefix.replace(/\/$/, "") || route.path.startsWith(prefix),
      );
      expect(ok, `${route.method} ${route.path} is public but not on the allowlist`).toBe(true);
    }
    const sessionRoutes = API_ROUTE_CATALOG.filter((r) => r.auth === "session");
    expect(sessionRoutes.length).toBeGreaterThan(20);
  });
});
