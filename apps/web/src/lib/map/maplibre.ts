import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

/**
 * MapLibre 6 loads its worker from beside its own module file. Vite bundles that
 * module into /assets/index-*.js and never emits the worker, so production builds
 * 404 on it and nothing worker-backed renders (GeoJSON overlays, vector tiles).
 * Point MapLibre at a worker Vite builds together with its shared chunk.
 * Import maplibregl from here, not from 'maplibre-gl', so this runs first.
 */
maplibregl.setWorkerUrl(workerUrl);

export { maplibregl };
