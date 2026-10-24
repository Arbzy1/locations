import { useMemo } from 'react';
import type { StyleSpecification } from 'maplibre-gl';
import { useTheme } from '../lib/theme';
import { useUnits } from '../lib/units';
import { usePublicConfig } from './useApi';
import {
  CARTO_DARK,
  CARTO_LIGHT,
  expandRasterTiles,
  rasterStyle,
  resolveRasterTemplate,
} from '../lib/map/mapStyle';

/**
 * Theme-following basemap for secondary maps (same env tiles and user overrides as the
 * explorer Map, without its basemap switcher). Shares the `public-config` query cache.
 */
export function useThemedMapStyle(): string | StyleSpecification {
  const { theme } = useTheme();
  const { mapTileDarkUrl, mapTileLightUrl } = useUnits();
  const { data: mapConfig } = usePublicConfig();

  return useMemo(() => {
    const vectorUrl = theme === 'dark' ? mapConfig?.mapStyleDark : mapConfig?.mapStyleLight;
    if (vectorUrl) return vectorUrl;
    const darkUrl = mapTileDarkUrl || mapConfig?.mapTileDark || CARTO_DARK;
    const lightUrl = mapTileLightUrl || mapConfig?.mapTileLight || CARTO_LIGHT;
    const raster = resolveRasterTemplate('auto', theme, darkUrl, lightUrl);
    return rasterStyle(expandRasterTiles(raster.tiles), mapConfig?.mapAttr || '&copy; OSM &copy; CARTO');
  }, [theme, mapConfig, mapTileDarkUrl, mapTileLightUrl]);
}
