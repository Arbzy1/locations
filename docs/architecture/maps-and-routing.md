# Maps and routing

Env (Worker secrets/vars):

- `MAP_TILE_DARK_URL` / `MAP_TILE_LIGHT_URL` (commercial tiles; Carto fallback)
- `OSRM_BASE` (self-hosted or paid routing; public OSRM is local-dev fallback)
- `GEOCODE_BASE` (Nominatim-compatible reverse geocode; public Nominatim is local-dev fallback)

Keys never go in `VITE_*`. The SPA reads tile URLs from `GET /api/config` (non-secret URL templates only).

Viewport and clusters are derived from the tenant’s points, not a hardcoded UK bbox.
