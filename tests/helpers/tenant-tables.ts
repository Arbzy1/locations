/** Tenant tables that must FORCE RLS. Keep in sync with packages/db/src/schema.ts. */
export const TENANT_TABLES = [
  "visits",
  "activities",
  "day_stats",
  "analytics_cache",
  "data_sources",
  "import_jobs",
  "export_jobs",
  "place_labels",
  "user_settings",
  "subscriptions",
  "named_trips",
  "life_chapters",
] as const;

export type TenantTable = (typeof TENANT_TABLES)[number];

/** Parse pgTable("name") blocks that include a tenant column. */
export function tenantTablesFromSchema(schemaSource: string): string[] {
  const tables: string[] = [];
  const re = /pgTable\(\s*"([^"]+)"/g;
  for (const match of schemaSource.matchAll(re)) {
    const name = match[1];
    const from = (match.index ?? 0) + match[0].length;
    const brace = schemaSource.indexOf("{", from);
    if (brace < 0) continue;
    const body = sliceBalancedObject(schemaSource, brace);
    if (body.includes('tenant: text("tenant")') || body.includes("tenant: text('tenant')")) {
      tables.push(name);
    }
  }
  return [...new Set(tables)].sort();
}

function sliceBalancedObject(source: string, openBrace: number): string {
  let depth = 0;
  for (let i = openBrace; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(openBrace, i + 1);
    }
  }
  return source.slice(openBrace);
}
