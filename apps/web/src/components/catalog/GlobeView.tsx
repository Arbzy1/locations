import { useEffect, useMemo, useRef, useState } from 'react';
import type { StyleSpecification } from 'maplibre-gl';
import { maplibregl } from '../../lib/map/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import CatalogPage from './CatalogPage';
import { useHeatmap, usePublicConfig } from '../../hooks/useApi';
import { useTheme } from '../../lib/theme';
import { useUnits } from '../../lib/units';
import { CARTO_DARK, CARTO_LIGHT, expandRasterTiles, rasterStyle } from '../../lib/map/mapStyle';
import { resolveCssColor } from '../../lib/map/journeyColors';
import type { HeatmapPoint } from '../../types';

/** Stable default: a fresh [] per render would rebuild the globe every render. */
const NO_POINTS: HeatmapPoint[] = [];
const FALLBACK_CENTER: [number, number] = [0, 20];

function heatmapCentroid(points: HeatmapPoint[]): [number, number] {
  if (points.length === 0) return FALLBACK_CENTER;
  let latSum = 0;
  let sinSum = 0;
  let cosSum = 0;
  let weightSum = 0;
  for (const p of points) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    const w = Math.max(1, Number(p.count) || 1);
    const rad = (p.lon * Math.PI) / 180;
    latSum += p.lat * w;
    sinSum += Math.sin(rad) * w;
    cosSum += Math.cos(rad) * w;
    weightSum += w;
  }
  if (weightSum <= 0) return FALLBACK_CENTER;
  const lat = Math.max(-85, Math.min(85, latSum / weightSum));
  const lon = (Math.atan2(sinSum / weightSum, cosSum / weightSum) * 180) / Math.PI;
  return [Number.isFinite(lon) ? lon : 0, Number.isFinite(lat) ? lat : 20];
}

export default function GlobeView() {
  const { data: config } = usePublicConfig();
  const { data: heatmap } = useHeatmap();
  const points = heatmap ?? NO_POINTS;
  const { theme, mood } = useTheme();
  const { mapTileDarkUrl, mapTileLightUrl } = useUnits();
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');

  const initialCenter = useMemo(() => heatmapCentroid(points), [points]);

  const styleSpec = useMemo((): string | StyleSpecification => {
    const dark = theme === 'dark';
    const userTiles = dark ? mapTileDarkUrl : mapTileLightUrl;
    const vectorUrl = !userTiles
      ? dark
        ? config?.mapStyleDark
        : config?.mapStyleLight
      : null;
    if (vectorUrl) return vectorUrl;
    const rasterTemplate =
      userTiles ||
      (dark ? config?.mapTileDark : config?.mapTileLight) ||
      (dark ? CARTO_DARK : CARTO_LIGHT);
    return rasterStyle(expandRasterTiles(rasterTemplate), config?.mapAttr || '&copy; OSM &copy; CARTO');
  }, [theme, config, mapTileDarkUrl, mapTileLightUrl]);

  useEffect(() => {
    if (config && config.globe === false) return;
    if (!host.current) return;
    let map: maplibregl.Map | null = null;
    try {
      const accent = resolveCssColor('var(--accent)');
      const instance = new maplibregl.Map({
        container: host.current,
        style: styleSpec,
        center: initialCenter,
        zoom: points.length > 0 ? 2.2 : 1.4,
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
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Globe failed to load');
    }
    return () => {
      map?.remove();
    };
  }, [points, config, styleSpec, initialCenter, mood]);

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
