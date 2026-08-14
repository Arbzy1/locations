# Tenancy and RLS

`tenantForUser(user)` returns `"demo"` for `role === "demo"`, otherwise the Better Auth user id.

## Two layers

1. **Drizzle** `eq(table.tenant, tenant)` on every location query.
2. **FORCE ROW LEVEL SECURITY** on tenant tables. Policies:

   `USING (tenant = current_setting('app.tenant', true))`
   `WITH CHECK (tenant = current_setting('app.tenant', true))`

Empty GUC matches no rows (fail closed).

## `withTenant`

Worker connections use a transactional driver. Each authenticated request:

1. `BEGIN`
2. `SELECT set_config('app.tenant', $tenant, true)`
3. Queries
4. `COMMIT`

## Roles

- App URL should be a role **without** BYPASSRLS (`locations_app` when you can create it on Neon).
- Migrations may use a privileged role. Documented SQL: `packages/db/drizzle/0003_rls.sql`.

## Shared caches

`route_cache` and `place_cache` are OSM geometry/address only. User-edited names live in `place_labels`.

Catalog tenant tables `named_trips` and `life_chapters` use the same FORCE RLS policy as visits. Staff `/api/admin/stats` reads the caller’s tenant only.
