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
