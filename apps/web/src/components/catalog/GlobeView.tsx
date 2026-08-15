import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import CatalogPage from './CatalogPage';
import { useHeatmap, usePublicConfig } from '../../hooks/useApi';
import { useTheme } from '../../lib/theme';

export default function GlobeView() {
  const { data: config } = usePublicConfig();
  const { data: points = [] } = useHeatmap();
  const { theme, mood } = useTheme();
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (config && config.globe === false) return;
    if (!host.current) return;
    let map: maplibregl.Map | null = null;
    let cancelled = false;
    void (async () => {
      try {
        if (cancelled || !host.current) return;
        const styleRes = await fetch('/api/config', { credentials: 'include' });
        const cfg = (await styleRes.json()) as { mapTileDark?: string; mapAttr?: string };
        const tiles = [cfg.mapTileDark || 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'].map((u) =>
          u.replace('{s}', 'a').replace('{r}', ''),
        );
        const accent =
          getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() ||
          'var(--accent)';
        const instance = new maplibregl.Map({
          container: host.current,
          style: {
            version: 8,
            sources: {
              tiles: { type: 'raster', tiles, tileSize: 256, attribution: cfg.mapAttr || '' },
            },
            layers: [{ id: 'tiles', type: 'raster', source: 'tiles' }],
          },
          center: [0, 20],
          zoom: 1.4,
        });
        instance.setProjection({ type: 'globe' });
        instance.on('load', () => {
          const features = points.map((p) => ({
            type: 'Feature' as const,
            properties: { count: p.count },
            geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] },
          }));
          instance.addSource('heat', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features },
          });
          instance.addLayer({
            id: 'heat-dots',
            type: 'circle',
            source: 'heat',
            paint: {
              'circle-radius': ['interpolate', ['linear'], ['get', 'count'], 1, 2, 50, 8],
              'circle-color': accent,
              'circle-opacity': 0.75,
            },
          });
        });
        map = instance;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Globe failed to load');
      }
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [points, config, theme, mood]);

  if (config && config.globe === false) {
    return (
      <CatalogPage title="Globe">
        <p className="text-sm text-text-muted">Globe view is turned off for this environment.</p>
      </CatalogPage>
    );
  }

  return (
      <CatalogPage title="Globe" description="Coverage from heatmap points, not raw visits. Isolated from the product maps.">
      {error && <p className="text-sm text-train">{error}</p>}
      <div ref={host} className="h-[min(70vh,36rem)] overflow-hidden rounded-lg border border-border" />
    </CatalogPage>
  );
}
