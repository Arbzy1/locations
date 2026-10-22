import { useEffect, useRef } from "react";
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
  zones?: Array<{ id: string; name: string; geojson: unknown }>;
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

const emptyCollection: LineCollection = { type: "FeatureCollection", features: [] };

function stationEl(selected: boolean, label: string): HTMLDivElement {
  const el = document.createElement("div");
  el.className = selected
    ? "h-2.5 w-2.5 cursor-pointer rounded-lg border border-bg bg-walk"
    : "h-2 w-2 cursor-pointer rounded-lg border border-bg bg-background";
  el.setAttribute("role", "button");
  el.setAttribute("aria-label", label);
  return el;
}

function markerEl(kind: "origin" | "destination" | "via"): HTMLDivElement {
  const el = document.createElement("div");
  el.className =
    kind === "origin"
      ? "h-3 w-3 rounded-lg border border-bg bg-text"
      : kind === "destination"
        ? "h-3 w-3 rounded-lg border border-bg bg-walk"
        : "h-3 w-3 rounded-lg border-2 border-walk bg-transparent";
  el.setAttribute("role", "img");
  el.setAttribute(
    "aria-label",
    kind === "origin" ? "Origin" : kind === "destination" ? "Destination" : "Stop",
  );
  return el;
}

function whenStyleReady(map: maplibregl.Map, fn: () => void): void {
  if (map.isStyleLoaded()) fn();
  else map.once("style.load", fn);
}

/** Route colours follow the live theme tokens (Leaflet/MapLibre paint cannot read var()). */
function routeColours() {
  const css = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return { alt: read("--text-muted", "#8b949e"), selected: read("--accent", "#58a6ff") };
}

function ensureRouteLayers(map: maplibregl.Map): void {
  if (map.getSource("routes")) return;
  const colours = routeColours();
  map.addSource("routes", { type: "geojson", data: emptyCollection });
  map.addLayer({
    id: "routes-hit",
    type: "line",
    source: "routes",
    paint: {
      "line-color": "#000000",
      "line-width": 12,
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
  clickRef.current = onMapClick;
  originDragRef.current = onOriginDrag;
  destDragRef.current = onDestinationDrag;
  viaDragRef.current = onWaypointDrag;
  selectRef.current = onSelectAlternative;
  stationClickRef.current = onSelectStation;
  viewRef.current = onViewChange;

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
        return current;
      }
      const marker = new maplibregl.Marker({ element: markerEl(slot), draggable: true })
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
    const apply = () => {
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
      (map.getSource("routes") as maplibregl.GeoJSONSource | undefined)?.setData(routeDataRef.current);
    });
  }, [style, styleKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (!map.getLayer("routes-sel")) return;
      const colours = routeColours();
      map.setPaintProperty("routes-alt", "line-color", colours.alt);
      map.setPaintProperty("routes-sel", "line-color", colours.selected);
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
