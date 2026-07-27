declare module 'leaflet.heat' {
  import * as L from 'leaflet';

  interface HeatLayerOptions {
    minOpacity?: number;
    maxZoom?: number;
    max?: number;
    radius?: number;
    blur?: number;
    gradient?: Record<number, string>;
  }

  function heatLayer(
    latlngs: Array<[number, number, number?]>,
    options?: HeatLayerOptions,
  ): L.Layer;

  export = heatLayer;
}

declare namespace L {
  function heatLayer(
    latlngs: Array<[number, number, number?]>,
    options?: any,
  ): L.Layer;
}
