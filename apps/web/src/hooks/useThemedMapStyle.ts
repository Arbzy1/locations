import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { StyleSpecification } from 'maplibre-gl';
import { useTheme } from '../lib/theme';
import { useUnits } from '../lib/units';
import {
  CARTO_DARK,
  CARTO_LIGHT,
  expandRasterTiles,
  rasterStyle,
  resolveRasterTemplate,
} from '../lib/map/mapStyle';

type PublicMapConfig = {
  mapTileDark: string;
  mapTileLight: string;
  mapAttr: string;
  mapStyleDark: string | null;
  mapStyleLight: string | null;
};

/**
 * Theme-following basemap for secondary maps (same env tiles and user overrides as the
 * explorer Map, without its basemap switcher). Shares the `map-config` query cache.
 */
export function useThemedMapStyle(): string | StyleSpecification {
  const { theme } = useTheme();
  const { mapTileDarkUrl, mapTileLightUrl } = useUnits();
  const { data: mapConfig } = useQuery({
    queryKey: ['map-config'],
    queryFn: async () => {
      const res = await fetch('/api/config');
      if (!res.ok) return null;
      return res.json() as Promise<PublicMapConfig>;
    },
    staleTime: Infinity,
  });

  return useMemo(() => {
    const vectorUrl = theme === 'dark' ? mapConfig?.mapStyleDark : mapConfig?.mapStyleLight;
    if (vectorUrl) return vectorUrl;
    const darkUrl = mapTileDarkUrl || mapConfig?.mapTileDark || CARTO_DARK;
    const lightUrl = mapTileLightUrl || mapConfig?.mapTileLight || CARTO_LIGHT;
    const raster = resolveRasterTemplate('auto', theme, darkUrl, lightUrl);
    return rasterStyle(expandRasterTiles(raster.tiles), mapConfig?.mapAttr || '&copy; OSM &copy; CARTO');
  }, [theme, mapConfig, mapTileDarkUrl, mapTileLightUrl]);
}
