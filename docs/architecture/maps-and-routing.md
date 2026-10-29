# Maps and routing

Product maps (Day View, Hotspots, Insights insets, catalog pages) use **MapLibre GL**. The optional `/globe` page is a separate MapLibre globe of heatmap points.

Env (Worker secrets/vars):

- `MAP_TILE_DARK_URL` / `MAP_TILE_LIGHT_URL` (commercial raster XYZ; Carto fallback)
- `MAP_STYLE_DARK_URL` / `MAP_STYLE_LIGHT_URL` (optional vector style JSON URLs; enables 3D buildings)
- `MAP_CUSTOM_TILE_HOSTS` (comma-separated hostnames; empty disables Settings custom tiles)
- `MAP_TILE_ATTR`
- `OSRM_BASE` (self-hosted or paid routing; public OSRM is local-dev fallback)
- `GEOCODE_BASE` (Nominatim-compatible reverse geocode; public Nominatim is local-dev fallback)

Keys never go in `VITE_*`. The SPA reads tile and style URLs from `GET /api/config` (non-secret URL templates only). Vector style stays env-only; users cannot paste a style JSON URL.

Custom raster XYZ in Settings is https-only, `{z}` `{x}` `{y}` required, host must match `MAP_CUSTOM_TILE_HOSTS`. Those hosts (and vector style hosts) are folded into CSP `img-src` / `connect-src`. MapLibre workers use `worker-src 'self' blob:`.

Viewport and clusters are derived from the tenant's points, not a hardcoded UK bbox.

Street View and Mapillary are external links with latitude and longitude only. No place names in those URLs. No vendor scripts on the page.

## Journey lines

`routeActivity` (`apps/api/src/services.ts`) draws each Day View journey from the best evidence available, recorded as `route_source`:

| `route_source` | Line |
|---|---|
| `gps-rail` | Train or Underground: the stored `activities.rail_geometry`, the GPS fixes followed along the rail network (computed in the browser, see below) |
| `gps-road` | GPS fixes map-matched onto roads by OSRM (`/match`, chunked; via-point route as a fallback), cached in `route_cache` under a hash of the fixes |
| `gps` | Straight lines between GPS fixes: rail without a rail line, flights, or a road match that strays from the fixes |
| `road-estimate` | No fixes: fastest OSRM road route between start and end |
| `rail-arc` / `straight` | No fixes and no road route |

Before matching, `journeyTrace` (`packages/db/src/geo.ts`) drops a Google start or end point that could not be reached from the nearest fix in the time between them (over 250 km/h), and `cleanTrace` drops single-fix GPS spikes. A matched road line is only kept when it stays with the fixes (`roadFollowsFixes`: median distance at most 80 m and 70% of fixes within 100 m). Live OSRM calls are capped per Day View request (`MAX_LIVE_ROUTE_CALLS`) to stay inside the free plan's 50 subrequests.

Routes view (`GET /api/routes`) makes no routing calls: rail line, else recorded trace, else a straight line, thinned to the span.

## Transport mode from GPS

Google often labels train trips "in passenger vehicle". `packages/db/src/rail.ts` re-checks every journey with GPS fixes in the browser (import Web Worker, and a one-off backfill per `MODE_DETECTOR_VERSION`) and stores the result on the row (`mode`, plus `google_mode`, `mode_detail`, `rail_geometry`). See [import pipeline](import-pipeline.md#transport-mode-from-gps-points) for the rules and APIs.

Rail lines come from static OpenStreetMap tiles for Great Britain and Ireland under `apps/web/public/assets/rail/v1/` (z10 JSON tiles plus `index.json`), built once with `npm run rail:build` (Overpass; run by hand, never in CI). `/assets/*` is served without invoking the Worker, so the tiles cost no CPU or requests. Attribution: [credits](../legal/credits.md). Outside the covered area only the speed checks run.

## Day View colours

Journey lines are coloured by transport mode by default, from theme tokens `--mode-walking`, `--mode-car`, ... (`apps/web/src/index.css`, dark and light values) exposed as `MODE_COLORS`. MapLibre paint, SVG chart fills and canvas need literal colours: resolve with `resolveCssColor` (`apps/web/src/lib/map/journeyColors.ts`). Layers has "Colour lines by: Transport / Journey" (per browser, `localStorage` `locations-journey-colour`).

Within a journey, `journeyPieces` (`apps/web/src/lib/map/journeyPieces.ts`, drawing only) pins the GPS fixes to the drawn line and splits it: stretches with no fix for over 10 minutes while moving over 1 km are a faint dash (tunnels, phone asleep; 5 minutes would have dashed 55% of train distance on a real export), and slow stretches under 7 km/h at either end of a train or Underground journey draw as walking (the walk to and from the platform; not cars or buses, whose slow starts are traffic and stops).

Each journey has a numbered badge (matching the timeline) 40% along its line, direction arrows from zoom 13, and `line-offset` so a trip back along the same road draws beside the trip out. Tapping a line, badge or timeline row focuses that journey (Day View owns the state) and fades the rest. The top-left legend lists the day's modes and hides or shows each.
