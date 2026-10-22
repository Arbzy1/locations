import { setWorkerUrl } from 'maplibre-gl';
// MapLibre 6 finds its worker via `new URL('./maplibre-gl-worker.mjs', import.meta.url)`, which the
// production bundle does not emit (GeoJSON sources then never load). Vite bundles it here instead.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

setWorkerUrl(workerUrl);
