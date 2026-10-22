# Journey cost architecture

Product summary: [product/journey-cost.md](../product/journey-cost.md). This feature was merged in from the standalone Brim app; it now follows the same tenancy, RLS, auth, and UI rules as the rest of Locations.

## Layout

| Path | Contents |
|------|----------|
| `packages/brim` (`@locations/brim`) | Pure TypeScript. `./engine` (cost calculator), `./routing` (Google, OSRM, fixture providers, route cache keys), `./shared` (types, VCA / Fuel Finder / carbon / DVLA normalisers, zone geometry, tariffs, fixtures). MIT, see `packages/brim/LICENSE`. |
| `packages/db/src/brim-schema.ts` | Drizzle tables, exported through `@locations/db`. |
| `packages/db/drizzle/0020_brim.sql`, `0021_brim_rls.sql` | Tables (with PostGIS) and the FORCE RLS / GRANT companion. |
| `apps/api/src/brim/` | Hono handlers, `routes.ts` (`registerBrimRoutes`), `db/repo.ts` (tenant-scoped data access), `sync.ts` (cron ingest). |
| `apps/web/src/components/brim/` | `JourneyCostView` (tab shell), `EstimateView`, `GarageView`, `HistoryView`, `RouteMap`, pickers. |
| `apps/web/src/lib/brim/` | API client, request composition, map geometry. |
| `scripts/brim/` | Data loaders run with `tsx` (`npm run brim:*`). |
| `data/brim/` | Zone and toll GeoJSON, EV network tariffs, VCA metadata. `*/raw/` is gitignored. |

## Engine purity

`@locations/brim/engine` is a calculator, not a service. It never reads the clock, env, network, or filesystem. The API gathers time, forecast temperature, prices, route, and charges, and passes them in. That keeps tests deterministic (golden fixtures under `tests/fixtures/brim/golden`) and lets charge windows be tested across DST without mocking the clock.

## Tenancy and RLS

Tenant tables carry `tenant` (from `tenantForUser`, never from the request) and FORCE RLS on `app.tenant`:

`brim_vehicles`, `brim_tariffs`, `brim_calibrations`, `brim_fill_ups`, `brim_journeys`, `brim_settings`, `brim_saved_places`.

Child tables (tariffs, fill-ups, calibrations) also carry `tenant`, so every policy is a plain column check and every query keeps `eq(table.tenant, tenant)`. Handlers return 404 for another tenant's ids, including before body validation.

Shared, non-PII reference tables use `USING (true)` like `route_cache`: `brim_stations`, `brim_station_prices`, `brim_zones`, `brim_tolls`, `brim_vca_vehicles`, `brim_grid_intensity`, `brim_route_cache`, `brim_ingestion_state`.

`wipeTenantData` deletes the tenant's journey cost rows with the rest of the account.

## API

All routes are under `/api/brim/*`, behind the normal session middleware. See [routes](../api/routes.md#journey-cost). Routes that call paid providers (estimate, places, registration lookup) have a per-tenant rate limit. Writes are blocked for the demo role.

## Fixture mode

`BRIM_FIXTURES = "1"` (wrangler var; on for local and staging) serves recorded routing, geocoding, Fuel Finder, carbon, and DVLA responses, and reads zones / stations / VCA from in-code fixtures instead of Neon. User data (cars, journeys) always persists to Neon. Production sets `"0"`.

## Providers and secrets

| Key | Kind | Purpose |
|-----|------|---------|
| `GOOGLE_MAPS_API_KEY` | secret | Google Routes and Places. Without it, routing falls back to `OSRM_BASE`. |
| `ROUTING_CEILING_USD`, `ROUTING_SPENT_USD` | wrangler var | Spend guard: past the ceiling, routing fails over to OSRM. |
| `DVLA_VES_API_KEY` | secret | Registration lookup. Missing outside fixture mode: lookup returns 503. |
| `VRM_ENCRYPTION_KEY` | secret | 32 random bytes, base64. Encrypts stored plates. Missing: cars save without a plate. |
| `FUEL_FINDER_CLIENT_ID`, `FUEL_FINDER_CLIENT_SECRET` | secret | Forecourt price sync. Missing: the cron only syncs carbon intensity. |

## Scheduled sync

The Worker `scheduled` handler dispatches on the cron expression: `0 8 1 * *` sends monthly recaps; `*/20 * * * *` runs `runBrimSync` (carbon intensity always, Fuel Finder when its secrets are set). Logs carry counts only.

## Registration plates

- Lookup is on demand (`POST /api/brim/vehicles/resolve`). No plate-keyed cache, no raw DVLA payload stored.
- A saved car stores derived fields plus HMAC-SHA256 `vrm_hash` and AES-256-GCM `vrm_encrypted`. List and detail responses never include either; the owning tenant gets the decrypted plate.
- The redacting logger strips `vrm`, `reg`, `registration`, `plate`, and address keys.

## Map

`RouteMap` uses MapLibre with `useThemedMapStyle` (same env tiles and user overrides as the explorer map) and repaints route colours from the theme tokens. `lib/map/maplibreWorker.ts` points MapLibre at a Vite-bundled worker; without it GeoJSON sources never load in production builds. The initial viewport is Great Britain because the feature is UK-only (prices, zones, DVLA).

## Data loading

```bash
npm run db:migrate:dev
npm run brim:load-zones
npm run brim:sync-vca
npm run brim:check
```

Add `-- --env staging` or `-- --env production` to target another environment.
