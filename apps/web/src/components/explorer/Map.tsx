import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MLMap, Marker, PositionAnchor, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Visit, Activity, HeatmapPoint, Connector, MapFocusTarget, HotspotLabel } from '../../types';
import { MODE_LABELS } from '../../types';
import { formatTime, formatDistance, formatDuration } from '../../utils/format';
import { useTheme } from '../../lib/theme';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useUnits } from '../../lib/units';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useSession } from '../../lib/auth';
import { escapeHtml } from '../../lib/map/escapeHtml';
import { Dialog, DialogContent } from '../ui/dialog';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { EjectField } from '../ui/eject-field';
import {
  CARTO_DARK,
  CARTO_LIGHT,
  expandRasterTiles,
  rasterStyle,
  resolveRasterTemplate,
  type BasemapId,
} from '../../lib/map/mapStyle';
import { dashClass, extendBounds, getArrowPoints, lineCoords, toLngLat } from '../../lib/map/mapGeometry';
import { activityPopupHtml, connectorPopupHtml, getJourneyColor, visitPopupHtml } from '../../lib/map/mapPopups';
import { pathLengthMeters } from '../../lib/map/mapMeasure';
import { spiderfyOffsets } from '../../lib/map/mapSpiderfy';
import { lookaroundLinksHtml } from '../../lib/map/mapLinks';
import type { MapBookmark } from '../../lib/map/mapBookmarks';
import { MAX_MAP_BOOKMARKS } from '../../lib/map/mapBookmarks';
import MapChrome from './MapChrome';

type FC = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    id?: number | string;
    properties: Record<string, unknown>;
    geometry:
      | { type: 'Point'; coordinates: [number, number] }
      | { type: 'LineString'; coordinates: [number, number][] };
  }>;
};

const emptyFc = (): FC => ({ type: 'FeatureCollection', features: [] });

export type HeatmapLayerSpec = {
  id: string;
  points: HeatmapPoint[];
  colorToken?: string | null;
};

const HEAT_COLORS: [number, string][] = [
  [0, 'rgba(0,0,0,0)'],
  [0.1, '#2d4a7c'],
  [0.28, '#58a6ff'],
  [0.48, '#3fb950'],
  [0.68, '#d29922'],
  [0.88, '#f47067'],
  [1, '#ffa198'],
];

type PublicMapConfig = {
  mapTileDark: string;
  mapTileLight: string;
  mapAttr: string;
  mapStyleDark: string | null;
  mapStyleLight: string | null;
  customTiles: boolean;
};

function cssToken(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function heatColorStops(token?: string | null): (number | string)[] {
  if (!token) return HEAT_COLORS.flat();
  const color = cssToken(`--${token}`, cssToken('--accent', '#58a6ff'));
  return [0, 'rgba(0,0,0,0)', 0.2, color, 0.55, color, 1, color];
}

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function htmlMarker(html: string, anchor: PositionAnchor = 'center'): Marker {
  const el = document.createElement('div');
  el.innerHTML = html;
  el.style.pointerEvents = 'none';
  return new maplibregl.Marker({ element: el, anchor, pitchAlignment: 'map', rotationAlignment: 'map' });
}

export interface MapHandle {
  flyToVisit: (visit: Visit) => void;
  flyToActivity: (activity: Activity) => void;
  invalidateSize: () => void;
}

interface MapProps {
  visits?: Visit[];
  activities?: Activity[];
  connectors?: Connector[];
  heatmapPoints?: HeatmapPoint[];
  heatmapLayers?: HeatmapLayerSpec[];
  sourceColors?: Record<string, string>;
  hotspotLabels?: HotspotLabel[];
  areaMarkers?: { lat: number; lon: number; label: string; visits: number }[];
  corridorLines?: { from: [number, number]; to: [number, number]; count: number }[];
  homeWorkPins?: { kind: 'home' | 'work'; lat: number; lon: number; label: string }[];
  compact?: boolean;
  center?: [number, number];
  zoom?: number;
  focusTarget?: MapFocusTarget | null;
  sizeSignal?: number;
  playhead?: { lat: number; lon: number } | null;
  followPlayhead?: boolean;
  dayDate?: string;
}

const MapView = forwardRef<MapHandle, MapProps>(function MapView(
  {
    visits = [],
    activities = [],
    connectors = [],
    heatmapPoints,
    heatmapLayers,
    sourceColors,
    hotspotLabels = [],
    areaMarkers = [],
    corridorLines = [],
    homeWorkPins = [],
    compact = false,
    center = [20, 0],
    zoom = 2,
    focusTarget = null,
    sizeSignal = 0,
    playhead = null,
    followPlayhead = false,
    dayDate,
  },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const miniRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const miniMapRef = useRef<MLMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const playheadMarkerRef = useRef<Marker | null>(null);
  const spiderMarkersRef = useRef<Marker[]>([]);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const visitPopupById = useRef(new Map<string, string>());
  const overlayReady = useRef(false);
  const measureRef = useRef(false);
  const { theme } = useTheme();
  const { unit, mapBookmarks, mapTileDarkUrl, mapTileLightUrl } = useUnits();
  const queryClient = useQueryClient();
  const { isDesktop } = useBreakpoint();
  const { data: session } = useSession();
  const isDemo = (session?.user as { role?: string } | undefined)?.role === 'demo';
  const { data: mapConfig } = useQuery({
    queryKey: ['map-config'],
    queryFn: async () => {
      const res = await fetch('/api/config');
      if (!res.ok) return null;
      return res.json() as Promise<PublicMapConfig>;
    },
    staleTime: Infinity,
  });

  const [basemap, setBasemap] = useState<BasemapId>('auto');
  const [buildings3d, setBuildings3d] = useState(false);
  const [heatmapOn, setHeatmapOn] = useState(true);
  const [opacityPct, setOpacityPct] = useState(72);
  const [intensityPct, setIntensityPct] = useState(100);
  const [measuring, setMeasuring] = useState(false);
  const [measurePts, setMeasurePts] = useState<{ lat: number; lon: number }[]>([]);
  const [bookmarkOpen, setBookmarkOpen] = useState(false);
  const [bookmarkName, setBookmarkName] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(zoom);

  measureRef.current = measuring;
  const isNarrow = !isDesktop;

  const darkUrl = mapTileDarkUrl || mapConfig?.mapTileDark || CARTO_DARK;
  const lightUrl = mapTileLightUrl || mapConfig?.mapTileLight || CARTO_LIGHT;
  const mapAttr = mapConfig?.mapAttr || '&copy; OSM &copy; CARTO';
  const styleDark = mapConfig?.mapStyleDark || null;
  const styleLight = mapConfig?.mapStyleLight || null;
  const vectorUrl = basemap === 'auto' ? (theme === 'dark' ? styleDark : styleLight) : null;
  const hasVectorStyle = Boolean(vectorUrl);

  const styleSpec = useMemo((): string | StyleSpecification => {
    if (vectorUrl) return vectorUrl;
    const raster = resolveRasterTemplate(basemap, theme, darkUrl, lightUrl);
    const attr = raster.attr || mapAttr;
    return rasterStyle(expandRasterTiles(raster.tiles), attr);
  }, [vectorUrl, basemap, theme, darkUrl, lightUrl, mapAttr]);

  const styleKey = useMemo(
    () => (typeof styleSpec === 'string' ? styleSpec : JSON.stringify(styleSpec)),
    [styleSpec],
  );

  const sortedActivities = useMemo(
    () => [...activities].sort((a, b) => a.start.localeCompare(b.start)),
    [activities],
  );
  const totalJourneys = sortedActivities.length;
  const hasHeatmap = Boolean(
    (heatmapLayers && heatmapLayers.some((l) => l.points.length)) ||
      (heatmapPoints && heatmapPoints.length > 0),
  );

  const allCoords = useCallback((): [number, number][] => {
    const coords: [number, number][] = [];
    visits.forEach((v) => coords.push([v.lat, v.lon]));
    activities.forEach((a) => {
      if (a.route_geometry) a.route_geometry.forEach((c) => coords.push([c[0], c[1]]));
      else {
        coords.push([a.start_lat, a.start_lon]);
        coords.push([a.end_lat, a.end_lon]);
      }
    });
    connectors.forEach((c) => {
      if (c.route_geometry) c.route_geometry.forEach((p) => coords.push([p[0], p[1]]));
    });
    heatmapPoints?.forEach((p) => coords.push([p.lat, p.lon]));
    heatmapLayers?.forEach((layer) => layer.points.forEach((p) => coords.push([p.lat, p.lon])));
    areaMarkers.forEach((p) => coords.push([p.lat, p.lon]));
    corridorLines.forEach((c) => {
      coords.push(c.from);
      coords.push(c.to);
    });
    homeWorkPins.forEach((p) => coords.push([p.lat, p.lon]));
    return coords;
  }, [visits, activities, connectors, heatmapPoints, heatmapLayers, areaMarkers, corridorLines, homeWorkPins]);

  const clearMarkers = (list: Marker[]) => {
    list.forEach((m) => m.remove());
    list.length = 0;
  };

  const showPopup = useCallback((lngLat: [number, number], html: string) => {
    const map = mapRef.current;
    if (!map) return;
    popupRef.current?.remove();
    popupRef.current = new maplibregl.Popup({ closeButton: true, maxWidth: '320px', className: 'loc-popup' })
      .setLngLat(lngLat)
      .setHTML(html)
      .addTo(map);
  }, []);

  const apply3d = useCallback((map: MLMap, on: boolean) => {
    const style = map.getStyle();
    for (const layer of style.layers ?? []) {
      if (layer.type === 'fill-extrusion') {
        map.setLayoutProperty(layer.id, 'visibility', on ? 'visible' : 'none');
      }
    }
    const reduce = reducedMotion();
    map.easeTo({ pitch: on ? 45 : 0, duration: reduce ? 0 : 400 });
  }, []);

  const upsertSource = (map: MLMap, id: string, data: FC, extra: Record<string, unknown> = {}) => {
    const existing = map.getSource(id) as GeoJSONSource | undefined;
    if (existing) {
      existing.setData(data);
      return;
    }
    map.addSource(id, { type: 'geojson', data, ...extra });
  };

  const ensureLayer = (map: MLMap, layer: { id: string } & Record<string, unknown>) => {
    if (!map.getLayer(layer.id)) map.addLayer(layer as never);
  };

  const syncOverlays = useCallback(
    (map: MLMap) => {
      const accent = cssToken('--accent', '#58a6ff');
      const visitColor = cssToken('--visit', '#bc8cff');
      const onAccent = cssToken('--on-accent', '#fff');
      const surface = cssToken('--surface', '#161b22');
      const drive = cssToken('--drive', '#f778ba');
      const muted = cssToken('--text-muted', '#8b949e');
      const colorForActivity = (a: Activity, i: number) =>
        (a.source_id && sourceColors?.[a.source_id]) || getJourneyColor(i, totalJourneys);
      const colorForVisit = (v: Visit) =>
        (v.source_id && sourceColors?.[v.source_id]) || visitColor;

      const heatSpecs: Array<{ id: string; points: HeatmapPoint[]; token?: string | null }> =
        heatmapOn && heatmapLayers && heatmapLayers.length > 1
          ? heatmapLayers.map((layer) => ({
              id: `loc-heat-${layer.id}`,
              points: layer.points,
              token: layer.colorToken,
            }))
          : heatmapOn && heatmapPoints
            ? [{ id: 'loc-heat', points: heatmapPoints }]
            : [];

      const nextHeatIds = heatSpecs.map((s) => s.id);
      for (const oldId of [...(map.getStyle().layers ?? [])]
        .map((l) => l.id)
        .filter((id) => id.startsWith('loc-heat'))) {
        if (!nextHeatIds.includes(oldId) && map.getLayer(oldId)) map.removeLayer(oldId);
      }

      if (!heatSpecs.some((s) => s.id === 'loc-heat')) {
        upsertSource(map, 'loc-heat', emptyFc());
      }

      for (const spec of heatSpecs) {
        const features = spec.points.map((p) => ({
          type: 'Feature' as const,
          properties: { weight: p.weight ?? p.count },
          geometry: { type: 'Point' as const, coordinates: toLngLat(p.lat, p.lon) },
        }));
        const maxW = Math.max(1, ...features.map((f) => Number(f.properties.weight) || 1));
        upsertSource(map, spec.id, { type: 'FeatureCollection', features });
        ensureLayer(map, {
          id: spec.id,
          type: 'heatmap',
          source: spec.id,
          paint: {
            'heatmap-weight': ['interpolate', ['linear'], ['get', 'weight'], 0, 0, maxW, 1],
            'heatmap-intensity': Math.max(0.35, Math.min(2, intensityPct / 100)),
            'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 16, 9, 36],
            'heatmap-opacity': opacityPct / 100,
            'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], ...heatColorStops(spec.token)],
          },
        });
        if (map.getLayer(spec.id)) {
          map.setPaintProperty(spec.id, 'heatmap-intensity', Math.max(0.35, Math.min(2, intensityPct / 100)));
          map.setPaintProperty(spec.id, 'heatmap-opacity', opacityPct / 100);
        }
      }

      upsertSource(map, 'loc-areas', {
        type: 'FeatureCollection',
        features: areaMarkers.map((m, i) => ({
          type: 'Feature' as const,
          id: i,
          properties: { html: `<strong>${escapeHtml(m.label)}</strong><br/>${m.visits} visits${lookaroundLinksHtml(m.lat, m.lon)}` },
          geometry: { type: 'Point' as const, coordinates: toLngLat(m.lat, m.lon) },
        })),
      });
      ensureLayer(map, {
        id: 'loc-areas',
        type: 'circle',
        source: 'loc-areas',
        paint: {
          'circle-radius': 7,
          'circle-color': accent,
          'circle-stroke-width': 2,
          'circle-stroke-color': onAccent,
        },
      });

      upsertSource(map, 'loc-corridors', {
        type: 'FeatureCollection',
        features: corridorLines.map((c, i) => ({
          type: 'Feature' as const,
          id: i,
          properties: { html: `${c.count} trips` },
          geometry: {
            type: 'LineString' as const,
            coordinates: [toLngLat(c.from[0], c.from[1]), toLngLat(c.to[0], c.to[1])],
          },
        })),
      });
      ensureLayer(map, {
        id: 'loc-corridors',
        type: 'line',
        source: 'loc-corridors',
        paint: { 'line-color': accent, 'line-width': 3, 'line-opacity': 0.7 },
      });

      upsertSource(map, 'loc-connectors', {
        type: 'FeatureCollection',
        features: connectors.map((c, i) => {
          const positions: [number, number][] = c.route_geometry?.length
            ? c.route_geometry.map((p) => [p[0], p[1]])
            : [
                [c.from_lat, c.from_lon],
                [c.to_lat, c.to_lon],
              ];
          return {
            type: 'Feature' as const,
            id: i,
            properties: { html: connectorPopupHtml(c, unit) },
            geometry: { type: 'LineString' as const, coordinates: lineCoords(positions) },
          };
        }),
      });
      ensureLayer(map, {
        id: 'loc-connectors',
        type: 'line',
        source: 'loc-connectors',
        paint: {
          'line-color': muted,
          'line-width': 2,
          'line-opacity': 0.5,
          'line-dasharray': [1, 1.5],
        },
      });

      const actFeatures = sortedActivities.map((a, i) => {
        const positions: [number, number][] = a.route_geometry?.length
          ? a.route_geometry.map((c) => [c[0], c[1]])
          : [
              [a.start_lat, a.start_lon],
              [a.end_lat, a.end_lon],
            ];
        const color = colorForActivity(a, i);
        return {
          type: 'Feature' as const,
          id: i,
          properties: {
            dash: dashClass(a.mode),
            color,
            html: activityPopupHtml(a, i, totalJourneys, color, unit),
          },
          geometry: { type: 'LineString' as const, coordinates: lineCoords(positions) },
        };
      });
      upsertSource(map, 'loc-activities', { type: 'FeatureCollection', features: actFeatures });
      const dashLayers: { id: string; dash: string; dasharray?: number[] }[] = [
        { id: 'loc-act-solid', dash: 'solid' },
        { id: 'loc-act-walk', dash: 'walk', dasharray: [1, 1.5] },
        { id: 'loc-act-cycle', dash: 'cycle', dasharray: [2, 1] },
        { id: 'loc-act-bus', dash: 'bus', dasharray: [3, 1.5] },
        { id: 'loc-act-rail', dash: 'rail', dasharray: [4, 2, 1, 2] },
        { id: 'loc-act-fly', dash: 'fly', dasharray: [1.5, 2.5] },
        { id: 'loc-act-unknown', dash: 'unknown', dasharray: [1, 1] },
      ];
      for (const spec of dashLayers) {
        ensureLayer(map, {
          id: spec.id,
          type: 'line',
          source: 'loc-activities',
          filter: ['==', ['get', 'dash'], spec.dash],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': ['get', 'color'],
            'line-width': spec.dash === 'solid' ? 4 : 3,
            'line-opacity': 0.85,
            ...(spec.dasharray ? { 'line-dasharray': spec.dasharray } : {}),
          },
        });
      }

      visitPopupById.current.clear();
      const visitFeatures = visits.map((v, i) => {
        const id = `v-${i}`;
        visitPopupById.current.set(id, visitPopupHtml(v, i, visits.length, dayDate));
        return {
          type: 'Feature' as const,
          properties: { id, stop: v.stop_number || i + 1 },
          geometry: { type: 'Point' as const, coordinates: toLngLat(v.lat, v.lon) },
        };
      });
      upsertSource(map, 'loc-visits', { type: 'FeatureCollection', features: visitFeatures }, {
        cluster: visits.length > 1,
        clusterMaxZoom: 13,
        clusterRadius: 42,
      });
      ensureLayer(map, {
        id: 'loc-visits-clusters',
        type: 'circle',
        source: 'loc-visits',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': visitColor,
          'circle-radius': ['step', ['get', 'point_count'], 16, 8, 20, 20, 26],
          'circle-stroke-width': 2,
          'circle-stroke-color': onAccent,
        },
      });
      ensureLayer(map, {
        id: 'loc-visits-count',
        type: 'symbol',
        source: 'loc-visits',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-size': 11,
        },
        paint: { 'text-color': onAccent },
      });
      ensureLayer(map, {
        id: 'loc-visits-unclustered',
        type: 'circle',
        source: 'loc-visits',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': 7,
          'circle-color': visitColor,
          'circle-stroke-width': 2,
          'circle-stroke-color': onAccent,
        },
      });

      const measureFc: FC = {
        type: 'FeatureCollection',
        features:
          measurePts.length >= 2
            ? [
                {
                  type: 'Feature',
                  properties: {},
                  geometry: {
                    type: 'LineString',
                    coordinates: measurePts.map((p) => toLngLat(p.lat, p.lon)),
                  },
                },
              ]
            : measurePts.map((p) => ({
                type: 'Feature' as const,
                properties: {},
                geometry: { type: 'Point' as const, coordinates: toLngLat(p.lat, p.lon) },
              })),
      };
      upsertSource(map, 'loc-measure', measureFc);
      ensureLayer(map, {
        id: 'loc-measure-line',
        type: 'line',
        source: 'loc-measure',
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: { 'line-color': accent, 'line-width': 3, 'line-dasharray': [1, 1] },
      });
      ensureLayer(map, {
        id: 'loc-measure-pts',
        type: 'circle',
        source: 'loc-measure',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 5,
          'circle-color': accent,
          'circle-stroke-width': 2,
          'circle-stroke-color': onAccent,
        },
      });

      clearMarkers(markersRef.current);
      const z = map.getZoom();

      homeWorkPins.forEach((p) => {
        const color = p.kind === 'home' ? visitColor : drive;
        const marker = htmlMarker(
          `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:2px solid ${surface};box-shadow:0 0 0 2px ${color}"></div>`,
        );
        marker.setLngLat(toLngLat(p.lat, p.lon));
        marker.getElement().style.pointerEvents = 'auto';
        marker.getElement().title = p.kind === 'home' ? 'Home guess' : 'Work guess';
        marker.getElement().addEventListener('click', (ev) => {
          ev.stopPropagation();
          showPopup(
            toLngLat(p.lat, p.lon),
            `<strong>${p.kind === 'home' ? 'Home guess' : 'Work guess'}</strong><br/>${escapeHtml(p.label)}${lookaroundLinksHtml(p.lat, p.lon)}`,
          );
        });
        marker.addTo(map);
        markersRef.current.push(marker);
      });

      if (z >= 10) {
        hotspotLabels.forEach((h) => {
          const short = h.label.length > 28 ? `${h.label.slice(0, 26)}…` : h.label;
          const badge = h.badge ?? String(h.count);
          const token = h.color && /^[a-z]+$/.test(h.color) ? h.color : 'accent';
          const marker = htmlMarker(
            `<div style="display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border-radius:8px;background:color-mix(in srgb, var(--surface) 92%, transparent);border:1px solid var(--${token});box-shadow:0 2px 8px rgba(0,0,0,.18);color:var(--text);font:600 11px/1.2 system-ui,sans-serif;white-space:nowrap;transform:translateY(-100%)"><span style="display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 4px;border-radius:6px;background:var(--${token});color:var(--on-accent);font-size:10px">${h.rank}</span><span>${escapeHtml(short)}</span><span style="color:var(--text-muted);font-weight:500">${escapeHtml(badge)}</span></div>`,
            'bottom',
          );
          marker.setLngLat(toLngLat(h.lat, h.lon));
          marker.addTo(map);
          markersRef.current.push(marker);
        });
      }

      if (z >= 14) {
        visits.forEach((v, i) => {
          const stopNum = v.stop_number || i + 1;
          const marker = htmlMarker(
            `<div style="width:18px;height:18px;border-radius:50%;background:${colorForVisit(v)};color:${onAccent};font-weight:700;font-size:9px;display:flex;align-items:center;justify-content:center;border:2px solid ${onAccent};box-shadow:0 0 8px color-mix(in srgb, ${colorForVisit(v)} 60%, transparent)">${stopNum}</div>`,
          );
          marker.setLngLat(toLngLat(v.lat, v.lon));
          marker.addTo(map);
          markersRef.current.push(marker);
        });
      }

      if (z >= 15) {
        sortedActivities.forEach((a, i) => {
          const positions: [number, number][] = a.route_geometry?.length
            ? a.route_geometry.map((c) => [c[0], c[1]])
            : [
                [a.start_lat, a.start_lon],
                [a.end_lat, a.end_lon],
              ];
          const color = colorForActivity(a, i);
          const arrowCount = positions.length > 10 ? 3 : positions.length > 4 ? 2 : 1;
          getArrowPoints(positions, arrowCount).forEach((pt) => {
            const marker = htmlMarker(
              `<div style="width:12px;height:12px;display:flex;align-items:center;justify-content:center;transform:rotate(${pt.angle - 90}deg);color:${color};font-size:14px;font-weight:700;text-shadow:0 0 3px rgba(0,0,0,0.8);opacity:0.9">&#9654;</div>`,
            );
            marker.setLngLat(toLngLat(pt.lat, pt.lon));
            marker.addTo(map);
            markersRef.current.push(marker);
          });
        });
      }

      if (z >= 16) {
        visits.forEach((v, i) => {
          const stopNum = v.stop_number || i + 1;
          const placeName = escapeHtml(v.place_name || v.cluster);
          const stayText = escapeHtml(formatDuration(v.duration_minutes));
          const marker = htmlMarker(
            `<div style="background:color-mix(in srgb, var(--surface) 88%, transparent);border:1px solid color-mix(in srgb, var(--visit) 27%, transparent);border-radius:4px;padding:1px 6px;font-size:10px;color:var(--text);font-weight:600;white-space:nowrap;max-width:160px;overflow:hidden;text-overflow:ellipsis"><span style="color:var(--visit)">${stopNum}</span> ${placeName} <span style="color:var(--text-muted);font-weight:400">${stayText}</span></div>`,
            'left',
          );
          marker.setLngLat(toLngLat(v.lat, v.lon));
          marker.addTo(map);
          markersRef.current.push(marker);
        });
        sortedActivities.forEach((a, i) => {
          if (a.duration_minutes < 3) return;
          const positions: [number, number][] = a.route_geometry?.length
            ? a.route_geometry.map((c) => [c[0], c[1]])
            : [
                [a.start_lat, a.start_lon],
                [a.end_lat, a.end_lon],
              ];
          const pts = getArrowPoints(positions, 3);
          if (!pts[0]) return;
          const color = colorForActivity(a, i);
          const mode = MODE_LABELS[a.mode] || a.mode;
          const marker = htmlMarker(
            `<div style="background:${color}22;border:1px solid ${color}55;border-radius:4px;padding:1px 5px;font-size:9px;font-weight:600;color:${color};white-space:nowrap;text-shadow:0 0 4px rgba(0,0,0,0.9)">${escapeHtml(formatTime(a.start))} ${escapeHtml(mode)}</div>`,
            'bottom',
          );
          marker.setLngLat(toLngLat(pts[0].lat, pts[0].lon));
          marker.addTo(map);
          markersRef.current.push(marker);
        });
      }

      overlayReady.current = true;
    },
    [
      areaMarkers,
      corridorLines,
      connectors,
      dayDate,
      heatmapOn,
      heatmapPoints,
      heatmapLayers,
      sourceColors,
      homeWorkPins,
      hotspotLabels,
      intensityPct,
      measurePts,
      opacityPct,
      showPopup,
      sortedActivities,
      totalJourneys,
      unit,
      visits,
    ],
  );
  const syncOverlaysRef = useRef(syncOverlays);
  syncOverlaysRef.current = syncOverlays;
  const apply3dRef = useRef(apply3d);
  apply3dRef.current = apply3d;
  const allCoordsRef = useRef(allCoords);
  allCoordsRef.current = allCoords;
  const buildings3dRef = useRef(buildings3d);
  buildings3dRef.current = buildings3d;
  const hasVectorRef = useRef(hasVectorStyle);
  hasVectorRef.current = hasVectorStyle;

  const bindClicks = useCallback(
    (map: MLMap) => {
      const openFrom = (e: maplibregl.MapLayerMouseEvent) => {
        if (measureRef.current) return;
        const f = e.features?.[0];
        const html = f?.properties?.html as string | undefined;
        if (html) showPopup([e.lngLat.lng, e.lngLat.lat], html);
      };
      const layers = [
        'loc-areas',
        'loc-corridors',
        'loc-connectors',
        'loc-act-solid',
        'loc-act-walk',
        'loc-act-cycle',
        'loc-act-bus',
        'loc-act-rail',
        'loc-act-fly',
        'loc-act-unknown',
      ];
      for (const id of layers) {
        map.on('click', id, openFrom);
        map.on('mouseenter', id, () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', id, () => {
          map.getCanvas().style.cursor = '';
        });
      }
      map.on('click', 'loc-visits-unclustered', (e) => {
        if (measureRef.current) return;
        const id = e.features?.[0]?.properties?.id as string | undefined;
        const html = id ? visitPopupById.current.get(id) : undefined;
        if (html) showPopup([e.lngLat.lng, e.lngLat.lat], html);
      });
      map.on('click', 'loc-visits-clusters', (e) => {
        if (measureRef.current) return;
        const f = e.features?.[0];
        if (!f || f.geometry.type !== 'Point') return;
        const clusterId = f.properties?.cluster_id as number;
        const coords = f.geometry.coordinates as [number, number];
        const src = map.getSource('loc-visits') as GeoJSONSource;
        src.getClusterExpansionZoom(clusterId).then((nextZoom) => {
          if (nextZoom > map.getZoom() + 0.4) {
            map.easeTo({ center: coords, zoom: nextZoom, duration: reducedMotion() ? 0 : 500 });
            return;
          }
          return src.getClusterLeaves(clusterId, 40, 0).then((leaves) => {
            clearMarkers(spiderMarkersRef.current);
            const centerPx = map.project(coords);
            const offsets = spiderfyOffsets(leaves.length);
            leaves.forEach((leaf, i) => {
              const off = offsets[i];
              const ll = map.unproject([centerPx.x + off.x, centerPx.y + off.y]);
              const id = leaf.properties?.id as string | undefined;
              const html = id ? visitPopupById.current.get(id) : undefined;
              const el = document.createElement('div');
              el.innerHTML = `<div style="width:14px;height:14px;border-radius:50%;background:var(--visit);border:2px solid var(--on-accent);cursor:pointer"></div>`;
              el.title = 'Visit in cluster';
              el.style.pointerEvents = 'auto';
              const marker = new maplibregl.Marker({ element: el }).setLngLat(ll);
              el.addEventListener('click', (ev) => {
                ev.stopPropagation();
                if (html) showPopup([ll.lng, ll.lat], html);
              });
              marker.addTo(map);
              spiderMarkersRef.current.push(marker);
            });
          });
        });
      });
      map.on('click', (e) => {
        if (!measureRef.current) return;
        setMeasurePts((prev) => [...prev, { lat: e.lngLat.lat, lon: e.lngLat.lng }]);
      });
      map.on('zoomend', () => {
        setZoomLevel(map.getZoom());
        if (overlayReady.current) syncOverlaysRef.current(map);
      });
    },
    [showPopup, syncOverlays],
  );

  useEffect(() => {
    const el = hostRef.current;
    if (!el || mapRef.current) return;
    const map = new maplibregl.Map({
      container: el,
      style: styleSpec,
      center: [center[1], center[0]],
      zoom,
      attributionControl: { compact: true },
      scrollZoom: !compact,
      dragRotate: !compact,
      touchPitch: !compact,
    });
    mapRef.current = map;
    if (!compact) {
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-left');
    }
    const onReady = () => {
      overlayReady.current = false;
      syncOverlaysRef.current(map);
      bindClicks(map);
      if (hasVectorRef.current) apply3dRef.current(map, buildings3dRef.current);
      const b = extendBounds(allCoordsRef.current());
      if (b && !followPlayhead) {
        map.fitBounds(
          [
            [b.west, b.south],
            [b.east, b.north],
          ],
          { padding: 30, maxZoom: 15, duration: 0 },
        );
      }
    };
    map.once('load', onReady);
    map.on('style.load', () => {
      overlayReady.current = false;
      syncOverlaysRef.current(map);
      if (hasVectorRef.current) apply3dRef.current(map, buildings3dRef.current);
    });
    return () => {
      popupRef.current?.remove();
      clearMarkers(markersRef.current);
      clearMarkers(spiderMarkersRef.current);
      playheadMarkerRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
    // Create once; style updates go through setStyle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    overlayReady.current = false;
    map.setStyle(styleSpec);
  }, [styleKey, styleSpec]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !overlayReady.current && !map.isStyleLoaded()) return;
    if (!map.isStyleLoaded()) return;
    syncOverlays(map);
  }, [syncOverlays]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !hasVectorStyle || !map.isStyleLoaded()) return;
    apply3d(map, buildings3d);
  }, [apply3d, buildings3d, hasVectorStyle]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const id = window.setTimeout(() => map.resize(), 50);
    return () => window.clearTimeout(id);
  }, [sizeSignal, sheetOpen]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onResize = () => map.resize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const followRef = useRef(followPlayhead);
  followRef.current = followPlayhead;
  const boundsKey = allCoords()
    .map((c) => c.join(','))
    .join('|')
    .slice(0, 4000);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || followRef.current) return;
    const b = extendBounds(allCoords());
    if (!b) return;
    map.fitBounds(
      [
        [b.west, b.south],
        [b.east, b.north],
      ],
      { padding: 30, maxZoom: 15, duration: reducedMotion() ? 0 : 400 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundsKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusTarget) return;
    const reduce = reducedMotion();
    if ('bounds' in focusTarget) {
      const b = extendBounds(focusTarget.bounds);
      if (!b) return;
      map.fitBounds(
        [
          [b.west, b.south],
          [b.east, b.north],
        ],
        { padding: 50, maxZoom: 16, duration: reduce ? 0 : 750 },
      );
    } else {
      map.easeTo({
        center: toLngLat(focusTarget.lat, focusTarget.lon),
        zoom: focusTarget.zoom ?? 16,
        duration: reduce ? 0 : 750,
      });
    }
  }, [focusTarget]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!playhead) {
      playheadMarkerRef.current?.remove();
      playheadMarkerRef.current = null;
      return;
    }
    if (!playheadMarkerRef.current) {
      playheadMarkerRef.current = htmlMarker(
        `<div style="width:16px;height:16px;border-radius:50%;background:var(--accent);border:2px solid var(--on-accent);box-shadow:0 0 0 4px color-mix(in srgb, var(--accent) 35%, transparent)"></div>`,
      );
      playheadMarkerRef.current.addTo(map);
    }
    playheadMarkerRef.current.setLngLat(toLngLat(playhead.lat, playhead.lon));
    if (followPlayhead) {
      const reduce = reducedMotion();
      if (reduce) map.jumpTo({ center: toLngLat(playhead.lat, playhead.lon) });
      else map.easeTo({ center: toLngLat(playhead.lat, playhead.lon), duration: 200 });
    }
  }, [playhead, followPlayhead]);

  useEffect(() => {
    if (!measuring) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMeasuring(false);
        setMeasurePts([]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [measuring]);

  useEffect(() => {
    if (compact || !isDesktop || !miniRef.current || !mapRef.current) return;
    const mini = new maplibregl.Map({
      container: miniRef.current,
      style: styleSpec,
      interactive: false,
      attributionControl: false,
      center: mapRef.current.getCenter(),
      zoom: Math.max(0, mapRef.current.getZoom() - 4),
    });
    miniMapRef.current = mini;
    const sync = () => {
      const main = mapRef.current;
      if (!main) return;
      mini.jumpTo({ center: main.getCenter(), zoom: Math.max(0, main.getZoom() - 4) });
    };
    mapRef.current.on('move', sync);
    return () => {
      mapRef.current?.off('move', sync);
      mini.remove();
      miniMapRef.current = null;
    };
  }, [compact, isDesktop, styleKey, styleSpec]);

  useImperativeHandle(ref, () => ({
    flyToVisit: (v: Visit) => {
      mapRef.current?.easeTo({
        center: toLngLat(v.lat, v.lon),
        zoom: 16,
        duration: reducedMotion() ? 0 : 800,
      });
    },
    flyToActivity: (a: Activity) => {
      const map = mapRef.current;
      if (!map) return;
      if (a.route_geometry && a.route_geometry.length > 1) {
        const b = extendBounds(a.route_geometry.map((c) => [c[0], c[1]]));
        if (b) {
          map.fitBounds(
            [
              [b.west, b.south],
              [b.east, b.north],
            ],
            { padding: 60, maxZoom: 15, duration: reducedMotion() ? 0 : 800 },
          );
        }
      } else {
        map.easeTo({
          center: toLngLat((a.start_lat + a.end_lat) / 2, (a.start_lon + a.end_lon) / 2),
          zoom: 14,
          duration: reducedMotion() ? 0 : 800,
        });
      }
    },
    invalidateSize: () => {
      mapRef.current?.resize();
    },
  }));

  const measureLabel =
    measurePts.length >= 2 ? formatDistance(pathLengthMeters(measurePts), unit) : '';

  const saveView = async () => {
    const map = mapRef.current;
    if (!map || isDemo) return;
    const name = bookmarkName.trim();
    if (!name) return;
    const cam = map.getCenter();
    const next: MapBookmark[] = [
      ...mapBookmarks,
      {
        id: crypto.randomUUID(),
        name: name.slice(0, 40),
        lng: cam.lng,
        lat: cam.lat,
        zoom: map.getZoom(),
        pitch: map.getPitch(),
        bearing: map.getBearing(),
      },
    ].slice(0, MAX_MAP_BOOKMARKS);
    const res = await fetch('/api/account/settings', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mapBookmarks: next }),
    });
    if (!res.ok) return;
    setBookmarkOpen(false);
    setBookmarkName('');
    void queryClient.invalidateQueries({ queryKey: ['me'] });
  };

  const deleteBookmark = async (id: string) => {
    if (isDemo) return;
    const next = mapBookmarks.filter((b) => b.id !== id);
    await fetch('/api/account/settings', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mapBookmarks: next }),
    });
    void queryClient.invalidateQueries({ queryKey: ['me'] });
  };

  const goBookmark = (b: MapBookmark) => {
    mapRef.current?.easeTo({
      center: [b.lng, b.lat],
      zoom: b.zoom,
      pitch: b.pitch,
      bearing: b.bearing,
      duration: reducedMotion() ? 0 : 700,
    });
  };

  const showLegend = totalJourneys > 0 && zoomLevel >= 13 && !compact;

  return (
    <div className="relative h-full w-full">
      <div ref={hostRef} className="h-full w-full" />
      {!compact && (
        <MapChrome
          isNarrow={isNarrow}
          sheetOpen={sheetOpen}
          onSheetOpenChange={setSheetOpen}
          basemap={basemap}
          onBasemap={setBasemap}
          hasVectorStyle={hasVectorStyle}
          buildings3d={buildings3d}
          onBuildings3d={setBuildings3d}
          hasHeatmap={hasHeatmap}
          heatmapOn={heatmapOn}
          onHeatmapOn={setHeatmapOn}
          opacityPct={opacityPct}
          onOpacityPct={setOpacityPct}
          intensityPct={intensityPct}
          onIntensityPct={setIntensityPct}
          measuring={measuring}
          measureLabel={measureLabel}
          onToggleMeasure={() => {
            setMeasuring((v) => !v);
            setMeasurePts([]);
          }}
          bookmarks={mapBookmarks}
          canEditBookmarks={!isDemo}
          onSaveView={() => {
            setBookmarkName('');
            setBookmarkOpen(true);
          }}
          onGoBookmark={goBookmark}
          onDeleteBookmark={(id) => void deleteBookmark(id)}
        />
      )}
      {!compact && isDesktop && (
        <div
          ref={miniRef}
          className="pointer-events-none absolute bottom-10 left-3 z-[400] h-32 w-32 overflow-hidden rounded-lg border border-border shadow-md"
          title="Overview map"
        />
      )}
      <Dialog open={bookmarkOpen} onOpenChange={setBookmarkOpen}>
        <DialogContent title="Save this map view">
          <h2 className="mb-3 text-sm font-semibold">Save this map view</h2>
          <EjectField label="Name" htmlFor="bookmark-name" className="mb-3">
            <Input
              id="bookmark-name"
              title="Name for this saved view"
              value={bookmarkName}
              onChange={(e) => setBookmarkName(e.target.value)}
              maxLength={40}
            />
          </EjectField>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" title="Cancel saving view" onClick={() => setBookmarkOpen(false)}>
              Cancel
            </Button>
            <Button type="button" title="Save map view" onClick={() => void saveView()}>
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {showLegend && (
        <div className="pointer-events-auto absolute right-3 bottom-10 z-[400] max-h-[min(140px,28vh)] min-w-0 max-w-[min(12rem,42vw)] overflow-y-auto rounded-lg border border-border bg-surface p-2 text-[10px] text-text lg:max-h-[260px] lg:min-w-[160px] lg:max-w-none lg:p-2.5 lg:text-[11px]">
          <div className="mb-1.5 text-[10px] font-semibold text-text-muted">YOUR DAY</div>
          {[
            ...visits.map((v) => ({
              time: v.start,
              type: 'visit' as const,
              label: v.place_name || v.cluster,
              color: v.source_id && sourceColors?.[v.source_id] ? sourceColors[v.source_id] : 'var(--visit)',
              sub: formatDuration(v.duration_minutes),
            })),
            ...sortedActivities.map((a, i) => ({
              time: a.start,
              type: 'journey' as const,
              label: `${MODE_LABELS[a.mode] || a.mode} - ${formatDistance(a.distance_meters, unit)}`,
              color: (a.source_id && sourceColors?.[a.source_id]) || getJourneyColor(i, totalJourneys),
              sub: formatTime(a.start),
            })),
          ]
            .sort((a, b) => a.time.localeCompare(b.time))
            .map((item, i) => (
              <div key={`${item.type}-${i}`} className="flex items-center gap-1.5 py-0.5">
                {item.type === 'visit' ? (
                  <span className="h-2 w-2 shrink-0 rounded-full border border-white" style={{ background: item.color }} />
                ) : (
                  <svg width="16" height="6" className="shrink-0">
                    <line x1="0" y1="3" x2="16" y2="3" stroke={item.color} strokeWidth="2" />
                  </svg>
                )}
                <span className="min-w-0 flex-1 truncate" style={item.type === 'journey' ? { color: item.color } : undefined}>
                  {item.label}
                </span>
                <span className="shrink-0 text-text-muted">{item.sub}</span>
              </div>
            ))}
          <p className="mt-1 text-[9px] text-text-muted opacity-70">
            {isNarrow ? 'Tap the timeline to focus the map.' : 'Zoom in further for on-map labels. Click the timeline to focus the map.'}
          </p>
        </div>
      )}
    </div>
  );
});

export default MapView;
