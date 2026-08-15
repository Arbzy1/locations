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
- `0012_rls_grants.sql` GRANTs tenant tables to `locations_app`. `npm run test:rls` loads `.env` / `.dev.vars` and, if the URL is a BYPASSRLS owner, SET ROLE to `locations_app` for leak tests.
- Migrations may use a privileged role. Documented SQL: `packages/db/drizzle/0003_rls.sql`.

## Shared caches

`route_cache` and `place_cache` are OSM geometry/address only. User-edited names live in `place_labels`.

Catalog tenant tables `named_trips`, `life_chapters`, and `export_jobs` use the same FORCE RLS policy as visits. Staff `/api/admin/stats` reads the caller’s tenant only. Cross-account operator pages loop `withTenant(tenantForUser(id), …)` for counts and job ids. They never `BYPASSRLS` and never select visits without a tenant GUC.

`ops_flags` and `ops_audit` are **not** tenant tables. They follow `stripe_events`: ENABLE RLS, `USING (true)`, app-layer staff gate. Do not add them to the FORCE tenant list.
