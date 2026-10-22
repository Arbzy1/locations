import { useEffect, useRef, useState } from 'react';
import type { StyleSpecification } from 'maplibre-gl';
import { maplibregl } from '../../lib/map/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import CatalogPage from './CatalogPage';
import { useHeatmap, usePublicConfig } from '../../hooks/useApi';
import { useTheme } from '../../lib/theme';
import type { HeatmapPoint } from '../../types';

/** Stable default: a fresh [] per render would rebuild the globe every render. */
const NO_POINTS: HeatmapPoint[] = [];

export default function GlobeView() {
  const { data: config } = usePublicConfig();
  const { data: heatmap } = useHeatmap();
  const points = heatmap ?? NO_POINTS;
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
        const cfg = (await styleRes.json()) as {
          mapTileDark?: string;
          mapTileLight?: string;
          mapAttr?: string;
          mapStyleDark?: string | null;
          mapStyleLight?: string | null;
        };
        if (cancelled || !host.current) return;
        const dark = theme === 'dark';
        const rasterTemplate =
          (dark ? cfg.mapTileDark : cfg.mapTileLight) ||
          cfg.mapTileDark ||
          'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png';
        // Same basemap as the product maps: the configured vector style, raster as fallback.
        const style: string | StyleSpecification = (dark ? cfg.mapStyleDark : cfg.mapStyleLight) || {
          version: 8,
          sources: {
            tiles: {
              type: 'raster',
              tiles: [rasterTemplate.replace('{s}', 'a').replace('{r}', '')],
              tileSize: 256,
              attribution: cfg.mapAttr || '',
            },
          },
          layers: [{ id: 'tiles', type: 'raster', source: 'tiles' }],
        };
        const accent =
          getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() ||
          'var(--accent)';
        const instance = new maplibregl.Map({
          container: host.current,
          style,
          center: [0, 20],
          zoom: 1.4,
        });
        map = instance;
        // setProjection throws "Style is not done loading" if called before the style loads.
        instance.on('style.load', () => instance.setProjection({ type: 'globe' }));
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
