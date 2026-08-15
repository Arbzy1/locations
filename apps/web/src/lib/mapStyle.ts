import type { StyleSpecification } from 'maplibre-gl';

export const OSM_STREET =
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
export const ESRI_SAT =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
export const CARTO_DARK =
  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
export const CARTO_LIGHT =
  'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

export function expandRasterTiles(template: string): string[] {
  const cleaned = template.replaceAll('{r}', '');
  if (cleaned.includes('{s}')) {
    return ['a', 'b', 'c', 'd'].map((s) => cleaned.replaceAll('{s}', s));
  }
  return [cleaned];
}

export function rasterStyle(tiles: string[], attribution: string): StyleSpecification {
  return {
    version: 8,
    sources: {
      basemap: {
        type: 'raster',
        tiles,
        tileSize: 256,
        attribution,
        maxzoom: 19,
      },
    },
    layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }],
  };
}

export type BasemapId = 'auto' | 'street' | 'satellite';

export function resolveRasterTemplate(
  basemap: BasemapId,
  theme: 'dark' | 'light',
  darkUrl: string,
  lightUrl: string,
): { tiles: string; attr: string } {
  if (basemap === 'street') return { tiles: OSM_STREET, attr: '&copy; OSM' };
  if (basemap === 'satellite') return { tiles: ESRI_SAT, attr: '&copy; Esri' };
  return {
    tiles: theme === 'dark' ? darkUrl : lightUrl,
    attr: '',
  };
}
