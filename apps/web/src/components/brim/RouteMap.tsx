import { useEffect, useLayoutEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "../../lib/map/maplibreWorker";
import { boundsFromPoints, polylinePoints, ukBounds } from "../../lib/brim/map-geometry";
import { useThemedMapStyle } from "../../hooks/useThemedMapStyle";
import { useTheme } from "../../lib/theme";

export type MapPin = { lat: number; lng: number; label?: string };

export type RouteMapOverlays = {
  stations?: Array<{ id: string; lat: number; lng: number; label?: string }>;
  selectedStationId?: string;
  zones?: Array<{ id: string; name: string; kind?: string; geojson: unknown }>;
};

export type RouteLine = { id: string; encodedPolyline: string };

export type RouteMapProps = {
  origin?: MapPin;
  destination?: MapPin;
  waypoints?: MapPin[];
  encodedPolyline?: string;
  alternatives?: RouteLine[];
  selectedRouteId?: string;
  overlays?: RouteMapOverlays;
  reduceMotion?: boolean;
  onMapClick: (pin: { lat: number; lng: number }) => void;
  onOriginDrag: (pin: { lat: number; lng: number }) => void;
  onDestinationDrag: (pin: { lat: number; lng: number }) => void;
  onWaypointDrag?: (index: number, pin: { lat: number; lng: number }) => void;
  onSelectAlternative?: (id: string) => void;
  onSelectStation?: (id: string) => void;
  pinArmed?: boolean;
  onViewChange?: (center: { lat: number; lng: number }) => void;
};

type LineCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: { id: string; selected: number };
    geometry: { type: "LineString"; coordinates: Array<[number, number]> };
  }>;
};

type GeoJsonData = Parameters<maplibregl.GeoJSONSource["setData"]>[0];

type ZoneCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: { id: string; name: string; isToll: number };
    geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
  }>;
};

const emptyCollection: LineCollection = { type: "FeatureCollection", features: [] };
const emptyZoneCollection: ZoneCollection = { type: "FeatureCollection", features: [] };

function stationEl(selected: boolean, label: string): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "flex h-11 w-11 cursor-pointer items-center justify-center bg-transparent";
  el.setAttribute("role", "button");
  el.setAttribute("aria-label", label);
  el.title = label;
  const dot = document.createElement("span");
  dot.className = selected
    ? "h-3.5 w-3.5 rounded-lg border border-bg bg-walk shadow-sm"
    : "h-2.5 w-2.5 rounded-lg border border-bg bg-surface shadow-sm";
  el.appendChild(dot);
  return el;
}

function markerEl(kind: "origin" | "destination" | "via", labelText?: string): HTMLDivElement {
  const roleLabel =
    kind === "origin" ? "Origin" : kind === "destination" ? "Destination" : "Stop";
  const fullLabel = labelText ? `${roleLabel}: ${labelText}` : roleLabel;
  const el = document.createElement("div");
  el.className = "flex h-11 w-11 cursor-grab items-center justify-center bg-transparent";
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", fullLabel);
  el.title = fullLabel;
  const dot = document.createElement("span");
  dot.className =
    kind === "origin"
      ? "h-3.5 w-3.5 rounded-lg border border-bg bg-text shadow-sm"
      : kind === "destination"
        ? "h-3.5 w-3.5 rounded-lg border border-bg bg-walk shadow-sm"
        : "h-3.5 w-3.5 rounded-lg border-2 border-walk bg-surface shadow-sm";
  el.appendChild(dot);
  return el;
}

function whenStyleReady(map: maplibregl.Map, fn: () => void): void {
  if (map.isStyleLoaded()) fn();
  else map.once("style.load", fn);
}

/** Route and zone colours follow live CSS theme tokens (MapLibre paint cannot evaluate var()). */
function routeColours() {
  const css = getComputedStyle(document.documentElement);
  const read = (name: string) => css.getPropertyValue(name).trim() || "rgba(128, 128, 128, 0.8)";
  return {
    alt: read("--text-muted"),
    selected: read("--accent"),
    zone: read("--visit"),
    toll: read("--train"),
  };
}

function ensureRouteLayers(map: maplibregl.Map): void {
  const colours = routeColours();
  if (!map.getSource("zones")) {
    map.addSource("zones", { type: "geojson", data: emptyZoneCollection as unknown as GeoJsonData });
    map.addLayer({
      id: "zones-fill",
      type: "fill",
      source: "zones",
      paint: {
        "fill-color": ["case", ["==", ["get", "isToll"], 1], colours.toll, colours.zone],
        "fill-opacity": 0.12,
      },
    });
    map.addLayer({
      id: "zones-line",
      type: "line",
      source: "zones",
      paint: {
        "line-color": ["case", ["==", ["get", "isToll"], 1], colours.toll, colours.zone],
        "line-width": 1.5,
        "line-opacity": 0.6,
      },
    });
  }
  if (map.getSource("routes")) return;
  map.addSource("routes", { type: "geojson", data: emptyCollection });
  map.addLayer({
    id: "routes-hit",
    type: "line",
    source: "routes",
    paint: {
      "line-color": "rgba(0, 0, 0, 0)",
      "line-width": 16,
      "line-opacity": 0,
    },
  });
  map.addLayer({
    id: "routes-alt",
    type: "line",
    source: "routes",
    filter: ["!=", ["get", "selected"], 1],
    paint: {
      "line-color": colours.alt,
      "line-width": 2,
      "line-opacity": 0.75,
    },
  });
  map.addLayer({
    id: "routes-sel",
    type: "line",
    source: "routes",
    filter: ["==", ["get", "selected"], 1],
    paint: {
      "line-color": colours.selected,
      "line-width": 4,
    },
  });
}

function toZoneFeatureCollection(
  zones: Array<{ id: string; name: string; kind?: string; geojson: unknown }> | undefined,
): ZoneCollection {
  if (!zones || zones.length === 0) return emptyZoneCollection;
  const features: ZoneCollection["features"] = [];
  for (const z of zones) {
    if (!z.geojson || typeof z.geojson !== "object") continue;
    const g = z.geojson as { type?: string; coordinates?: unknown };
    if (g.type !== "Polygon" && g.type !== "MultiPolygon") continue;
    features.push({
      type: "Feature",
      properties: {
        id: z.id,
        name: z.name,
        isToll: z.kind === "toll" ? 1 : 0,
      },
      geometry: {
        type: g.type,
        coordinates: g.coordinates,
      },
    });
  }
  return { type: "FeatureCollection", features };
}

export default function RouteMap(props: RouteMapProps) {
  const {
    origin,
    destination,
    waypoints = [],
    encodedPolyline,
    alternatives,
    selectedRouteId,
    reduceMotion = false,
    onMapClick,
    onOriginDrag,
    onDestinationDrag,
    onWaypointDrag,
    onSelectAlternative,
    onSelectStation,
    overlays,
    pinArmed = false,
    onViewChange,
  } = props;

  const style = useThemedMapStyle();
  const { theme } = useTheme();
  const styleKey = typeof style === "string" ? style : JSON.stringify(style);
  const styleRef = useRef(style);
  const styleKeyRef = useRef(styleKey);
  const routeDataRef = useRef<LineCollection>(emptyCollection);
  const zoneDataRef = useRef<ZoneCollection>(emptyZoneCollection);
  const rootRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const originMarker = useRef<maplibregl.Marker | null>(null);
  const destMarker = useRef<maplibregl.Marker | null>(null);
  const viaMarkers = useRef<maplibregl.Marker[]>([]);
  const stationMarkers = useRef<maplibregl.Marker[]>([]);
  const dragging = useRef(false);
  const clickRef = useRef(onMapClick);
  const originDragRef = useRef(onOriginDrag);
  const destDragRef = useRef(onDestinationDrag);
  const viaDragRef = useRef(onWaypointDrag);
  const selectRef = useRef(onSelectAlternative);
  const stationClickRef = useRef(onSelectStation);
  const viewRef = useRef(onViewChange);
  useLayoutEffect(() => {
    clickRef.current = onMapClick;
    originDragRef.current = onOriginDrag;
    destDragRef.current = onDestinationDrag;
    viaDragRef.current = onWaypointDrag;
    selectRef.current = onSelectAlternative;
    stationClickRef.current = onSelectStation;
    viewRef.current = onViewChange;
  });

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const map = new maplibregl.Map({
      container: node,
      style: styleRef.current,
      bounds: ukBounds(),
      fitBoundsOptions: { padding: 24, duration: 0 },
      attributionControl: { compact: true },
      trackResize: true,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    const resize = () => {
      if (!mapRef.current) return;
      const w = node.clientWidth;
      const h = node.clientHeight;
      if (w < 2 || h < 2) return;
      map.resize();
    };
    map.on("load", () => {
      resize();
      ensureRouteLayers(map);
      (map.getSource("zones") as maplibregl.GeoJSONSource | undefined)?.setData(
        zoneDataRef.current as unknown as GeoJsonData,
      );
      (map.getSource("routes") as maplibregl.GeoJSONSource | undefined)?.setData(routeDataRef.current);
      const c = map.getCenter();
      viewRef.current?.({ lat: c.lat, lng: c.lng });
    });
    map.on("moveend", () => {
      const c = map.getCenter();
      viewRef.current?.({ lat: c.lat, lng: c.lng });
    });
    const ro = new ResizeObserver(resize);
    ro.observe(node);
    const frame = window.requestAnimationFrame(resize);
    map.on("click", (ev: maplibregl.MapMouseEvent) => {
      if (dragging.current) return;
      const hits = map.queryRenderedFeatures(ev.point, {
        layers: ["routes-hit", "routes-alt", "routes-sel"],
      });
      const id = hits[0]?.properties?.id;
      if (typeof id === "string" && selectRef.current) {
        selectRef.current(id);
        return;
      }
      clickRef.current({ lat: ev.lngLat.lat, lng: ev.lngLat.lng });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      ro.disconnect();
      originMarker.current?.remove();
      destMarker.current?.remove();
      for (const m of viaMarkers.current) m.remove();
      for (const m of stationMarkers.current) m.remove();
      viaMarkers.current = [];
      stationMarkers.current = [];
      originMarker.current = null;
      destMarker.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const syncMarker = (
      slot: "origin" | "destination" | "via",
      pin: MapPin | undefined,
      current: maplibregl.Marker | null,
      onDrag: (pin: { lat: number; lng: number }) => void,
    ): maplibregl.Marker | null => {
      if (!pin) {
        current?.remove();
        return null;
      }
      if (current) {
        current.setLngLat([pin.lng, pin.lat]);
        const el = current.getElement();
        const roleLabel =
          slot === "origin" ? "Origin" : slot === "destination" ? "Destination" : "Stop";
        const fullLabel = pin.label ? `${roleLabel}: ${pin.label}` : roleLabel;
        el.title = fullLabel;
        el.setAttribute("aria-label", fullLabel);
        return current;
      }
      const marker = new maplibregl.Marker({ element: markerEl(slot, pin.label), draggable: true })
        .setLngLat([pin.lng, pin.lat])
        .addTo(map);
      marker.on("dragstart", () => {
        dragging.current = true;
      });
      marker.on("dragend", () => {
        const ll = marker.getLngLat();
        onDrag({ lat: ll.lat, lng: ll.lng });
        window.setTimeout(() => {
          dragging.current = false;
        }, 0);
      });
      return marker;
    };

    const apply = () => {
      originMarker.current = syncMarker("origin", origin, originMarker.current, (p) =>
        originDragRef.current(p),
      );
      destMarker.current = syncMarker("destination", destination, destMarker.current, (p) =>
        destDragRef.current(p),
      );
      const nextVias: maplibregl.Marker[] = [];
      for (let i = 0; i < waypoints.length; i++) {
        const pin = waypoints[i];
        const existing = viaMarkers.current[i] ?? null;
        const marker = syncMarker("via", pin, existing, (p) => viaDragRef.current?.(i, p));
        if (marker) nextVias.push(marker);
      }
      for (let i = waypoints.length; i < viaMarkers.current.length; i++) {
        viaMarkers.current[i]?.remove();
      }
      viaMarkers.current = nextVias;
    };
    whenStyleReady(map, apply);
  }, [origin, destination, waypoints]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const lines: RouteLine[] =
      alternatives && alternatives.length > 0
        ? alternatives
        : encodedPolyline
          ? [{ id: "route-0", encodedPolyline }]
          : [];
    const apply = () => {
      ensureRouteLayers(map);
      const source = map.getSource("routes") as maplibregl.GeoJSONSource | undefined;
      const selected = selectedRouteId ?? lines[0]?.id;
      const collection: LineCollection = {
        type: "FeatureCollection",
        features: lines.map((line) => ({
          type: "Feature",
          properties: { id: line.id, selected: line.id === selected ? 1 : 0 },
          geometry: {
            type: "LineString",
            coordinates: polylinePoints(line.encodedPolyline).map((p) => [p.lng, p.lat]),
          },
        })),
      };
      routeDataRef.current = collection;
      source?.setData(collection);
      const selectedLine = lines.find((l) => l.id === selected) ?? lines[0];
      if (selectedLine) {
        const bounds = boundsFromPoints(polylinePoints(selectedLine.encodedPolyline));
        if (bounds) {
          map.fitBounds(bounds, {
            padding: 48,
            duration: reduceMotion ? 0 : 400,
            maxZoom: 12,
          });
        }
      }
    };
    whenStyleReady(map, apply);
  }, [encodedPolyline, alternatives, selectedRouteId, reduceMotion]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const stations = overlays?.stations ?? [];
    const selected = overlays?.selectedStationId;
    const zoneCollection = toZoneFeatureCollection(overlays?.zones);
    zoneDataRef.current = zoneCollection;
    const apply = () => {
      ensureRouteLayers(map);
      const zoneSource = map.getSource("zones") as maplibregl.GeoJSONSource | undefined;
      zoneSource?.setData(zoneCollection as unknown as GeoJsonData);

      for (const marker of stationMarkers.current) marker.remove();
      stationMarkers.current = stations.map((station) => {
        const el = stationEl(station.id === selected, station.label ?? "Forecourt");
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          stationClickRef.current?.(station.id);
        });
        return new maplibregl.Marker({ element: el }).setLngLat([station.lng, station.lat]).addTo(map);
      });
    };
    whenStyleReady(map, apply);
  }, [overlays]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleKeyRef.current === styleKey) return;
    styleKeyRef.current = styleKey;
    styleRef.current = style;
    map.setStyle(style);
    map.once("style.load", () => {
      ensureRouteLayers(map);
      (map.getSource("zones") as maplibregl.GeoJSONSource | undefined)?.setData(
        zoneDataRef.current as unknown as GeoJsonData,
      );
      (map.getSource("routes") as maplibregl.GeoJSONSource | undefined)?.setData(routeDataRef.current);
    });
  }, [style, styleKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const colours = routeColours();
      if (map.getLayer("routes-sel")) {
        map.setPaintProperty("routes-alt", "line-color", colours.alt);
        map.setPaintProperty("routes-sel", "line-color", colours.selected);
      }
      if (map.getLayer("zones-fill")) {
        map.setPaintProperty("zones-fill", "fill-color", [
          "case",
          ["==", ["get", "isToll"], 1],
          colours.toll,
          colours.zone,
        ]);
        map.setPaintProperty("zones-line", "line-color", [
          "case",
          ["==", ["get", "isToll"], 1],
          colours.toll,
          colours.zone,
        ]);
      }
    };
    whenStyleReady(map, apply);
  }, [theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = pinArmed ? "crosshair" : "";
  }, [pinArmed]);

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      className={
        pinArmed
          ? "h-full w-full cursor-crosshair focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          : "h-full w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      }
      aria-label="Trip map. Type an address, or tap Pin then tap the map to set origin, then destination."
    />
  );
}
