import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Polyline,
  Popup,
  Marker,
  useMap,
  useMapEvents,
  LayersControl,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Visit, Activity, HeatmapPoint, Connector, MapFocusTarget, HotspotLabel } from '../types';
import { MODE_LABELS } from '../types';
import { formatTime, formatDistance, formatDuration } from '../utils/format';
import { useTheme } from '../lib/theme';

// Fix default marker icon
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

/** Escape text before inserting into Leaflet HTML (innerHTML / divIcon). */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Line style per transport mode
const MODE_LINE_STYLE: Record<string, { weight: number; dashArray?: string }> = {
  walking: { weight: 3, dashArray: '4 6' },
  cycling: { weight: 3, dashArray: '8 4' },
  car: { weight: 4 },
  bus: { weight: 4, dashArray: '12 6' },
  train: { weight: 5, dashArray: '16 8 4 8' },
  subway: { weight: 5, dashArray: '16 8 4 8' },
  flying: { weight: 2, dashArray: '6 10' },
  unknown: { weight: 3, dashArray: '4 4' },
};

// Chronological color palette
const JOURNEY_PALETTE = [
  '#58a6ff', '#56d4dd', '#3fb950', '#56d364', '#a3d977',
  '#d29922', '#e8a030', '#f47067', '#f778ba', '#bc8cff',
  '#79c0ff', '#a5d6ff',
];

function getJourneyColor(index: number, total: number): string {
  if (total <= 1) return JOURNEY_PALETTE[0];
  const pos = (index / (total - 1)) * (JOURNEY_PALETTE.length - 1);
  return JOURNEY_PALETTE[Math.round(pos)];
}

function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function getArrowPoints(
  positions: [number, number][],
  count: number,
): { lat: number; lon: number; angle: number }[] {
  if (positions.length < 2) return [];
  const results: { lat: number; lon: number; angle: number }[] = [];
  const segLengths: number[] = [];
  let total = 0;
  for (let i = 1; i < positions.length; i++) {
    const d = Math.sqrt(
      (positions[i][0] - positions[i - 1][0]) ** 2 + (positions[i][1] - positions[i - 1][1]) ** 2,
    );
    segLengths.push(d);
    total += d;
  }
  if (total === 0) return [];
  for (let n = 0; n < count; n++) {
    const target = ((n + 1) / (count + 1)) * total;
    let acc = 0;
    for (let i = 0; i < segLengths.length; i++) {
      if (acc + segLengths[i] >= target) {
        const frac = (target - acc) / segLengths[i];
        const lat = positions[i][0] + frac * (positions[i + 1][0] - positions[i][0]);
        const lon = positions[i][1] + frac * (positions[i + 1][1] - positions[i][1]);
        const angle = bearing(positions[i][0], positions[i][1], positions[i + 1][0], positions[i + 1][1]);
        results.push({ lat, lon, angle });
        break;
      }
      acc += segLengths[i];
    }
  }
  return results;
}

function makeArrowIcon(angle: number, color: string): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:12px;height:12px;
      display:flex;align-items:center;justify-content:center;
      transform:rotate(${angle - 90}deg);
      pointer-events:none;
      color:${color};font-size:14px;font-weight:700;
      text-shadow:0 0 3px rgba(0,0,0,0.8);
      opacity:0.9;
    ">&#9654;</div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}

/** leaflet.heat scales intensity by 1/2^(maxZoom - zoom) when zoom < maxZoom â€” a high maxZoom (e.g. 15)
 *  makes country-level zoom (~6) nearly invisible. Use a low maxZoom so UK-wide views stay bright. */
const HEATMAP_MAX_ZOOM = 6;

const HEATMAP_GRADIENT = {
  0.1: '#2d4a7c',
  0.28: '#58a6ff',
  0.48: '#3fb950',
  0.68: '#d29922',
  0.88: '#f47067',
  1.0: '#ffa198',
};

function buildHeatmapOptions(maxCount: number, intensity: number) {
  const i = Math.max(0.35, Math.min(2, intensity));
  return {
    radius: 48,
    blur: 28,
    maxZoom: HEATMAP_MAX_ZOOM,
    max: maxCount / i,
    minOpacity: Math.min(0.42, 0.16 + 0.14 * i),
    gradient: HEATMAP_GRADIENT,
  };
}

export type HeatmapLayerProps = {
  points: HeatmapPoint[];
  enabled: boolean;
  /** 0â€“1, applied to canvas so basemap labels stay readable */
  opacity: number;
  /** ~0.35â€“2; higher = hotter / more saturated relative to the same data */
  intensity: number;
};

function HeatmapLayer({ points, enabled, opacity, intensity }: HeatmapLayerProps) {
  const map = useMap();
  const layerRef = useRef<{ layer: L.Layer & { _canvas?: HTMLCanvasElement } } | null>(null);
  const opacityRef = useRef(opacity);
  opacityRef.current = opacity;

  useEffect(() => {
    const canvas = layerRef.current?.layer?._canvas;
    if (canvas) {
      canvas.style.opacity = String(Math.max(0, Math.min(1, opacity)));
    }
  }, [opacity]);

  useEffect(() => {
    if (!enabled || !points.length) {
      const existing = layerRef.current?.layer;
      if (existing) {
        map.removeLayer(existing);
        layerRef.current = null;
      }
      return;
    }

    let cancelled = false;
    const maxCount = Math.max(1, ...points.map((p) => p.count));
    const data = points.map((p) => [p.lat, p.lon, p.count] as [number, number, number]);
    const opts = buildHeatmapOptions(maxCount, intensity);

    import('leaflet.heat').then(() => {
      if (cancelled) return;
      if (layerRef.current?.layer) {
        map.removeLayer(layerRef.current.layer);
        layerRef.current = null;
      }
      const heat = (L as any).heatLayer(data, opts);
      heat.addTo(map);
      const canvas = heat._canvas as HTMLCanvasElement | undefined;
      if (canvas) {
        canvas.style.opacity = String(Math.max(0, Math.min(1, opacityRef.current)));
      }
      layerRef.current = { layer: heat };
    });

    return () => {
      cancelled = true;
      const existing = layerRef.current?.layer;
      if (existing) {
        map.removeLayer(existing);
        layerRef.current = null;
      }
    };
  }, [map, points, enabled, intensity]);

  return null;
}

function FitBounds({ bounds }: { bounds: L.LatLngBoundsExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
  }, [map, bounds]);
  return null;
}

/** Hook to track current zoom level */
function useZoomLevel(): number {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useMapEvents({
    zoomend: () => setZoom(map.getZoom()),
  });
  return zoom;
}

/** Zoom-aware wrapper â€” only renders children above a given zoom threshold */
function ZoomLayer({ minZoom, children }: { minZoom: number; children: React.ReactNode }) {
  const zoom = useZoomLevel();
  if (zoom < minZoom) return null;
  return <>{children}</>;
}

/** Component to fly to a location when focusTarget changes */
function FlyToTarget({ target }: { target: MapFocusTarget | null }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    if ('bounds' in target) {
      map.flyToBounds(target.bounds, { padding: [50, 50], maxZoom: 16, duration: 0.75 });
    } else {
      map.flyTo([target.lat, target.lon], target.zoom ?? 16, { duration: 0.75 });
    }
  }, [map, target]);
  return null;
}

function DirectionArrows({ positions, color }: { positions: [number, number][]; color: string }) {
  const arrowCount = positions.length > 10 ? 3 : positions.length > 4 ? 2 : 1;
  const arrows = getArrowPoints(positions, arrowCount);
  return (
    <>
      {arrows.map((a, i) => (
        <Marker key={i} position={[a.lat, a.lon]} icon={makeArrowIcon(a.angle, color)} interactive={false} />
      ))}
    </>
  );
}

export interface MapHandle {
  flyToVisit: (visit: Visit) => void;
  flyToActivity: (activity: Activity) => void;
  invalidateSize: () => void;
}

/** Refit Leaflet after panel/shell size changes. */
function MapSizeInvalidator({ signal }: { signal?: number }) {
  const map = useMap();
  useEffect(() => {
    const id = window.setTimeout(() => map.invalidateSize({ animate: false }), 50);
    return () => window.clearTimeout(id);
  }, [map, signal]);

  useEffect(() => {
    const onResize = () => map.invalidateSize({ animate: false });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [map]);

  return null;
}

interface MapProps {
  visits?: Visit[];
  activities?: Activity[];
  connectors?: Connector[];
  heatmapPoints?: HeatmapPoint[];
  /** When false, heatmap canvas is not shown (basemap labels fully readable). */
  heatmapEnabled?: boolean;
  /** 0-1; lower lets town names on the basemap show through */
  heatmapOpacity?: number;
  /** ~0.35-2; relative strength (higher = hotter colours for the same visit counts) */
  heatmapIntensity?: number;
  /** Named tags for top hotspots (Hotspots tab) */
  hotspotLabels?: HotspotLabel[];
  center?: [number, number];
  zoom?: number;
  focusTarget?: MapFocusTarget | null;
  /** Increment to force Leaflet invalidateSize (panel open/close, breakpoint). */
  sizeSignal?: number;
}

const MapView = forwardRef<MapHandle, MapProps>(function MapView({
  visits = [],
  activities = [],
  connectors = [],
  heatmapPoints,
  heatmapEnabled = true,
  heatmapOpacity = 0.72,
  heatmapIntensity = 1,
  hotspotLabels = [],
  center = [51.45, -0.2],
  zoom = 10,
  focusTarget = null,
  sizeSignal = 0,
}, ref) {
  const mapRef = useRef<L.Map | null>(null);
  const { theme } = useTheme();
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const update = () => setIsNarrow(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useImperativeHandle(ref, () => ({
    flyToVisit: (v: Visit) => {
      mapRef.current?.flyTo([v.lat, v.lon], 16, { duration: 0.8 });
    },
    flyToActivity: (a: Activity) => {
      if (a.route_geometry && a.route_geometry.length > 1) {
        const bounds = L.latLngBounds(a.route_geometry.map((c) => [c[0], c[1]] as [number, number]));
        mapRef.current?.flyToBounds(bounds, { padding: [60, 60], maxZoom: 15, duration: 0.8 });
      } else {
        const midLat = (a.start_lat + a.end_lat) / 2;
        const midLon = (a.start_lon + a.end_lon) / 2;
        mapRef.current?.flyTo([midLat, midLon], 14, { duration: 0.8 });
      }
    },
    invalidateSize: () => {
      mapRef.current?.invalidateSize({ animate: false });
    },
  }));

  const getBounds = useCallback((): L.LatLngBoundsExpression | null => {
    const coords: [number, number][] = [];
    visits.forEach((v) => coords.push([v.lat, v.lon]));
    activities.forEach((a) => {
      if (a.route_geometry) a.route_geometry.forEach((c) => coords.push([c[0], c[1]]));
      else { coords.push([a.start_lat, a.start_lon]); coords.push([a.end_lat, a.end_lon]); }
    });
    connectors.forEach((c) => {
      if (c.route_geometry) c.route_geometry.forEach((p) => coords.push([p[0], p[1]]));
    });
    if (heatmapPoints && heatmapPoints.length > 0) {
      const ukPoints = heatmapPoints.filter((p) => p.lat > 49 && p.lat < 57 && p.lon > -6 && p.lon < 2);
      (ukPoints.length > 0 ? ukPoints : heatmapPoints.slice(0, 20)).forEach((p) => coords.push([p.lat, p.lon]));
    }
    if (coords.length < 2) return null;
    return L.latLngBounds(coords);
  }, [visits, activities, connectors, heatmapPoints]);

  const sortedActivities = [...activities].sort((a, b) => a.start.localeCompare(b.start));
  const totalJourneys = sortedActivities.length;

  return (
    <MapContainer center={center} zoom={zoom} className="w-full h-full" ref={mapRef} zoomControl={true}>
      <LayersControl key={`${theme}-${isNarrow ? 'n' : 'w'}`} position={isNarrow ? 'bottomleft' : 'topright'}>
        <LayersControl.BaseLayer checked={theme === 'dark'} name="Dark">
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution='&copy; OSM &copy; CARTO' />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer checked={theme === 'light'} name="Light">
          <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" attribution='&copy; OSM &copy; CARTO' />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Street">
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OSM' />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Satellite">
          <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution="&copy; Esri" />
        </LayersControl.BaseLayer>
      </LayersControl>

      <MapSizeInvalidator signal={sizeSignal} />
      <FitBounds bounds={getBounds()} />
      <FlyToTarget target={focusTarget} />
      {heatmapPoints && heatmapPoints.length > 0 && (
        <HeatmapLayer
          points={heatmapPoints}
          enabled={heatmapEnabled}
          opacity={heatmapOpacity}
          intensity={heatmapIntensity}
        />
      )}

      {hotspotLabels.length > 0 && (
        <ZoomLayer minZoom={10}>
          {hotspotLabels.map((h) => {
            const short =
              h.label.length > 28 ? `${h.label.slice(0, 26)}…` : h.label;
            const icon = L.divIcon({
              className: '',
              html: `<div style="
                display:inline-flex;align-items:center;gap:6px;
                padding:4px 8px;border-radius:8px;
                background:color-mix(in srgb, var(--surface) 92%, transparent);
                border:1px solid var(--border);
                box-shadow:0 2px 8px rgba(0,0,0,.18);
                color:var(--text);font:600 11px/1.2 system-ui,sans-serif;
                white-space:nowrap;pointer-events:none;transform:translateY(-100%);
              "><span style="
                display:inline-flex;align-items:center;justify-content:center;
                min-width:18px;height:18px;padding:0 4px;border-radius:6px;
                background:var(--accent);color:#fff;font-size:10px;
              ">${h.rank}</span><span>${escapeHtml(short)}</span><span style="
                color:var(--text-muted);font-weight:500;
              ">${h.count}</span></div>`,
              iconSize: [0, 0],
              iconAnchor: [0, 8],
            });
            return (
              <Marker
                key={`hotspot-tag-${h.rank}-${h.lat}-${h.lon}`}
                position={[h.lat, h.lon]}
                icon={icon}
                interactive={false}
              />
            );
          })}
        </ZoomLayer>
      )}

      {/* === ALWAYS VISIBLE: route lines and visit dots === */}

      {/* Connectors â€” thin dashed grey */}
      {connectors.map((c, i) => {
        const positions: [number, number][] = c.route_geometry
          ? c.route_geometry.map((p) => [p[0], p[1]])
          : [[c.from_lat, c.from_lon], [c.to_lat, c.to_lon]];
        const isStraight = !c.is_routed;
        return (
          <Polyline key={`conn-${i}`} positions={positions}
            pathOptions={{ color: '#484f58', weight: 2, opacity: 0.5, dashArray: '3 6' }}>
            <Popup>
              <div className="text-sm" style={{ maxWidth: 280 }}>
                <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text-muted)' }}>Gap between events</div>
                <div style={{ marginBottom: 4 }}>
                  {c.from_label || 'Previous event'} &rarr; {c.to_label || 'Next event'}
                </div>
                <div>{formatTime(c.from_time)} &rarr; {formatTime(c.to_time)}</div>
                <div>{formatDistance(c.distance_meters)}</div>
                <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6, color: 'var(--text-muted)', fontSize: '0.8em' }}>
                  {isStraight
                    ? <><strong>Straight line</strong> â€” Gap under 300m, direct connection between GPS coordinates.</>
                    : <><strong>Predicted route</strong> â€” Gap over 300m. Route predicted via OSRM road mapping.</>}
                </div>
              </div>
            </Popup>
          </Polyline>
        );
      })}

      {/* Activity routes â€” always visible */}
      {sortedActivities.map((a, i) => {
        const positions: [number, number][] = a.route_geometry
          ? a.route_geometry.map((c) => [c[0], c[1]])
          : [[a.start_lat, a.start_lon], [a.end_lat, a.end_lon]];
        const color = getJourneyColor(i, totalJourneys);
        const style = MODE_LINE_STYLE[a.mode] || MODE_LINE_STYLE.unknown;
        const roadSummary = a.steps?.filter((s) => s.name && s.distance_meters > 50).slice(0, 5).map((s) => s.name).join(' \u2192 ');
        const hasOsrm = a.has_osrm_route !== false && (a.steps?.length || 0) > 0;

        return (
          <Polyline key={`act-${i}`} positions={positions}
            pathOptions={{ color, weight: style.weight, opacity: 0.85, dashArray: style.dashArray, lineCap: 'round', lineJoin: 'round' }}>
            <Popup>
              <div className="text-sm" style={{ maxWidth: 300 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 22, height: 22, borderRadius: '50%', background: color,
                    color: '#fff', fontWeight: 700, fontSize: 10,
                  }}>{i + 1}</span>
                  <div>
                    <div style={{ fontWeight: 600 }}>{MODE_LABELS[a.mode] || a.mode}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85em' }}>Journey {i + 1} of {totalJourneys}</div>
                  </div>
                </div>
                {(a.from_place || a.to_place) && (
                  <div style={{ marginBottom: 4 }}>{a.from_place || 'Start'} &rarr; {a.to_place || 'End'}</div>
                )}
                <div>{formatTime(a.start)} &rarr; {formatTime(a.end)}</div>
                <div style={{ fontWeight: 600 }}>{formatDistance(a.distance_meters)} &middot; {formatDuration(a.duration_minutes)}</div>
                {roadSummary && <div style={{ marginTop: 4, color: 'var(--text-muted)', fontSize: '0.8em' }}>via {roadSummary}</div>}
                <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6, color: 'var(--text-muted)', fontSize: '0.8em' }}>
                  {a.is_rail
                    ? <><strong>Rail journey</strong>: Google detected you were on a {(MODE_LABELS[a.mode] || a.mode).toLowerCase()}.
                      The arc shows the approximate path between stations. Exact rail route not available.</>
                    : a.mode === 'flying'
                      ? <><strong>Straight line</strong>: Flight path shown as direct line.</>
                      : hasOsrm
                        ? <><strong>Predicted route</strong>: Road-level route predicted via OSRM. Actual route may differ.</>
                        : <><strong>Straight line</strong>: Route could not be determined from road data.</>}
                </div>
                <div style={{ color: '#484f58', fontSize: '0.75em', marginTop: 4 }}>
                  From: {a.start_lat.toFixed(5)}, {a.start_lon.toFixed(5)} &rarr; To: {a.end_lat.toFixed(5)}, {a.end_lon.toFixed(5)}
                </div>
              </div>
            </Popup>
          </Polyline>
        );
      })}

      {/* Visit dots â€” always visible (small at all zooms) */}
      {visits.map((v, i) => {
        const stopNum = v.stop_number || i + 1;
        const totalStops = v.total_stops || visits.length;
        const arrivedBy = v.arrived_by ? MODE_LABELS[v.arrived_by] || v.arrived_by : null;
        const departedBy = v.departed_by ? MODE_LABELS[v.departed_by] || v.departed_by : null;

        return (
          <CircleMarker key={`visit-${i}`} center={[v.lat, v.lon]} radius={7}
            pathOptions={{ fillColor: '#bc8cff', fillOpacity: 0.95, color: '#fff', weight: 2 }}>
            <Popup>
              <div className="text-sm" style={{ minWidth: 200, maxWidth: 300 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 22, height: 22, borderRadius: '50%', background: '#bc8cff',
                    color: '#fff', fontWeight: 700, fontSize: 11,
                  }}>{stopNum}</span>
                  <div>
                    <div style={{ fontWeight: 600 }}>{v.place_name || v.cluster}</div>
                    {v.place_short_address && <div style={{ color: 'var(--text-muted)', fontSize: '0.8em' }}>{v.place_short_address}</div>}
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85em' }}>Stop {stopNum} of {totalStops}</div>
                  </div>
                </div>
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 2 }}>
                  <div>Arrived: <strong>{formatTime(v.start)}</strong></div>
                  <div>Left: <strong>{formatTime(v.end)}</strong></div>
                  <div style={{ color: '#bc8cff', fontWeight: 600, marginTop: 2 }}>Stayed {formatDuration(v.duration_minutes)}</div>
                </div>
                {(arrivedBy || departedBy) && (
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 6, color: 'var(--text-muted)', fontSize: '0.85em' }}>
                    {arrivedBy && <div>Arrived by {arrivedBy}</div>}
                    {departedBy && <div>Left by {departedBy}</div>}
                  </div>
                )}
                {v.semantic_type !== 'Unknown' && (
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 6, color: 'var(--accent)' }}>{v.semantic_type}</div>
                )}
                <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6, color: 'var(--text-muted)', fontSize: '0.8em' }}>
                  <strong>Recorded location</strong> â€” Google Location History recorded a visit at these coordinates at {formatTime(v.start)}.
                  {v.place_name && v.place_name !== v.cluster && <> Place name resolved via Nominatim/OpenStreetMap.</>}
                </div>
                <div style={{ color: '#484f58', fontSize: '0.75em', marginTop: 2 }}>
                  Coordinates: {v.lat.toFixed(5)}, {v.lon.toFixed(5)}
                </div>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}

      {/* Numbered circles on visit markers â€” only when zoomed in */}
      <ZoomLayer minZoom={14}>
        {visits.map((v, i) => {
          const stopNum = v.stop_number || i + 1;
          const icon = L.divIcon({
            className: '',
            html: `<div style="
              width:18px;height:18px;border-radius:50%;
              background:#bc8cff;color:#fff;font-weight:700;font-size:9px;
              display:flex;align-items:center;justify-content:center;
              border:2px solid #fff;box-shadow:0 0 8px rgba(188,140,255,0.6);
              pointer-events:none;
            ">${stopNum}</div>`,
            iconSize: [18, 18],
            iconAnchor: [9, 9],
          });
          return <Marker key={`num-${i}`} position={[v.lat, v.lon]} icon={icon} interactive={false} />;
        })}
      </ZoomLayer>

      {/* Direction arrows on routes â€” only when zoomed in */}
      <ZoomLayer minZoom={15}>
        {sortedActivities.map((a, i) => {
          const positions: [number, number][] = a.route_geometry
            ? a.route_geometry.map((c) => [c[0], c[1]])
            : [[a.start_lat, a.start_lon], [a.end_lat, a.end_lon]];
          const color = getJourneyColor(i, totalJourneys);
          return <DirectionArrows key={`arrows-${i}`} positions={positions} color={color} />;
        })}
      </ZoomLayer>

      {/* Place name labels next to visits */}
      <ZoomLayer minZoom={16}>
        {visits.map((v, i) => {
          const stopNum = v.stop_number || i + 1;
          const placeName = v.place_name || v.cluster;
          const stayText = formatDuration(v.duration_minutes);
          const icon = L.divIcon({
            className: '',
            html: `<div style="
              background:color-mix(in srgb, var(--surface) 88%, transparent);border:1px solid color-mix(in srgb, var(--visit) 27%, transparent);border-radius:4px;
              padding:1px 6px;font-size:10px;color:var(--text);font-weight:600;
              white-space:nowrap;pointer-events:none;
              text-shadow:0 0 3px color-mix(in srgb, var(--bg) 80%, transparent);
              max-width:160px;overflow:hidden;text-overflow:ellipsis;
            "><span style="color:var(--visit)">${stopNum}</span> ${placeName} <span style="color:var(--text-muted);font-weight:400">${stayText}</span></div>`,
            iconSize: [0, 0],
            iconAnchor: [-14, 5],
          });
          return <Marker key={`name-${i}`} position={[v.lat, v.lon]} icon={icon} interactive={false} />;
        })}
      </ZoomLayer>

      {/* Journey time + mode labels on routes */}
      <ZoomLayer minZoom={16}>
        {sortedActivities.map((a, i) => {
          if (a.duration_minutes < 3) return null;
          const positions: [number, number][] = a.route_geometry
            ? a.route_geometry.map((c) => [c[0], c[1]])
            : [[a.start_lat, a.start_lon], [a.end_lat, a.end_lon]];
          if (positions.length < 2) return null;
          const pts = getArrowPoints(positions, 3);
          if (pts.length === 0) return null;
          const pt = pts[0];
          const color = getJourneyColor(i, totalJourneys);
          const mode = MODE_LABELS[a.mode] || a.mode;
          const icon = L.divIcon({
            className: '',
            html: `<div style="
              background:${color}22;border:1px solid ${color}55;border-radius:4px;
              padding:1px 5px;font-size:9px;font-weight:600;color:${color};
              white-space:nowrap;pointer-events:none;
              text-shadow:0 0 4px rgba(0,0,0,0.9);
            ">${escapeHtml(formatTime(a.start))} ${escapeHtml(mode)}</div>`,
            iconSize: [0, 0],
            iconAnchor: [0, -6],
          });
          return <Marker key={`time-${i}`} position={[pt.lat, pt.lon]} icon={icon} interactive={false} />;
        })}
      </ZoomLayer>

      {/* Journey legend: hidden when zoomed out to reduce clutter */}
      {totalJourneys > 0 && (
        <ZoomLayer minZoom={13}>
          <JourneyLegend
            activities={sortedActivities}
            totalJourneys={totalJourneys}
            visits={visits}
            compact={isNarrow}
          />
        </ZoomLayer>
      )}
    </MapContainer>
  );
});

export default MapView;

function JourneyLegend({
  activities,
  totalJourneys,
  visits,
  compact,
}: {
  activities: Activity[];
  totalJourneys: number;
  visits: Visit[];
  compact: boolean;
}) {
  const map = useMap();
  const legendRef = useRef<L.Control | null>(null);
  const { theme } = useTheme();

  useEffect(() => {
    const legend = new L.Control({ position: 'bottomright' });
    legend.onAdd = () => {
      const div = L.DomUtil.create('div', 'journey-legend');
      const maxH = compact ? 'min(140px, 28vh)' : '260px';
      const minW = compact ? '0' : '160px';
      const maxW = compact ? 'min(12rem, 42vw)' : 'none';
      div.style.cssText = `background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:${compact ? '6px 8px' : '8px 10px'};font-size:${compact ? '10px' : '11px'};color:var(--text);max-height:${maxH};overflow-y:auto;min-width:${minW};max-width:${maxW};`;

      let html = '<div style="font-weight:600;margin-bottom:6px;color:var(--text-muted);font-size:10px;">YOUR DAY</div>';

      type LegendItem = { time: string; type: 'visit' | 'journey'; label: string; color: string; sub?: string };
      const items: LegendItem[] = [];

      visits.forEach((v) => {
        items.push({
          time: v.start,
          type: 'visit',
          label: escapeHtml(v.place_name || v.cluster),
          color: 'var(--visit)',
          sub: escapeHtml(formatDuration(v.duration_minutes)),
        });
      });

      activities.forEach((a, i) => {
        const color = getJourneyColor(i, totalJourneys);
        const mode = MODE_LABELS[a.mode] || a.mode;
        items.push({
          time: a.start,
          type: 'journey',
          label: `${escapeHtml(mode)} - ${escapeHtml(formatDistance(a.distance_meters))}`,
          color,
          sub: escapeHtml(formatTime(a.start)),
        });
      });

      items.sort((a, b) => a.time.localeCompare(b.time));

      items.forEach((item) => {
        if (item.type === 'visit') {
          html += `<div style="display:flex;align-items:center;gap:6px;padding:2px 0;">
            <span style="width:8px;height:8px;border-radius:50%;background:${item.color};border:1.5px solid #fff;flex-shrink:0;"></span>
            <span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.label}</span>
            <span style="color:var(--text-muted);flex-shrink:0;">${item.sub}</span>
          </div>`;
        } else {
          const style = MODE_LINE_STYLE[activities.find((a) => formatTime(a.start) === item.sub)?.mode || 'car'] || {};
          const dashAttr = style.dashArray ? `style="stroke-dasharray:${style.dashArray}"` : '';
          html += `<div style="display:flex;align-items:center;gap:6px;padding:2px 0;">
            <svg width="16" height="6" style="flex-shrink:0;"><line x1="0" y1="3" x2="16" y2="3" stroke="${item.color}" stroke-width="2" ${dashAttr}/></svg>
            <span style="color:${item.color};flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.label}</span>
            <span style="color:var(--text-muted);flex-shrink:0;">${item.sub}</span>
          </div>`;
        }
      });

      html += '<div style="border-top:1px solid var(--border);margin-top:6px;padding-top:4px;">';
      [['-', 'Car'], ['···', 'Walk'], ['--', 'Bus'], ['-·-', 'Train']].forEach(([sym, label]) => {
        html += `<span style="color:var(--text-muted);font-size:10px;margin-right:8px;">${sym} ${label}</span>`;
      });
      html += '</div>';
      html += compact
        ? '<div style="color:var(--text-muted);opacity:0.7;font-size:9px;margin-top:4px;">Tap the timeline to focus the map.</div>'
        : '<div style="color:var(--text-muted);opacity:0.7;font-size:9px;margin-top:4px;">Zoom in further for on-map labels. Click the timeline to focus the map.</div>';

      div.innerHTML = html;
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);
      return div;
    };

    legend.addTo(map);
    legendRef.current = legend;
    return () => {
      legend.remove();
      legendRef.current = null;
    };
  }, [map, activities, totalJourneys, visits, theme, compact]);

  return null;
}
