import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ADMIN_ROUTE_CATALOG, parseAdminHonoRoutes } from "@tests/helpers/admin-route-catalog";
import { API_ROUTE_CATALOG } from "@tests/helpers/api-route-catalog";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const adminSource = readFileSync(join(root, "apps/api/src/admin.ts"), "utf8");
const indexSource = readFileSync(join(root, "apps/api/src/index.ts"), "utf8");

describe("admin route catalog drift", () => {
  it("lists every /api/admin route registered on the Hono app", () => {
    const parsed = [
      ...parseAdminHonoRoutes(adminSource),
      ...parseAdminHonoRoutes(indexSource),
    ];
    const fromSource = new Set(parsed.map((r) => `${r.method} ${r.path}`));
    const fromCatalog = new Set(ADMIN_ROUTE_CATALOG.map((r) => `${r.method} ${r.path}`));
    const missing = [...fromSource].filter((k) => !fromCatalog.has(k)).sort();
    const extra = [...fromCatalog].filter((k) => !fromSource.has(k)).sort();
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
  });

  it("marks every admin route staffOnly in the security catalog", () => {
    for (const route of ADMIN_ROUTE_CATALOG) {
      const hit = API_ROUTE_CATALOG.find((r) => r.method === route.method && r.path === route.path);
      expect(hit?.staffOnly, `${route.method} ${route.path}`).toBe(true);
    }
  });
});
