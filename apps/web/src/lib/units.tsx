import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DistanceUnit } from '../utils/format';
import { useSession } from './auth';
import type { MapBookmark } from './mapBookmarks';

type MeResponse = {
  settings?: {
    distanceUnit?: DistanceUnit;
    timezone?: string | null;
    monthlyRecapEnabled?: boolean;
    mapBookmarks?: MapBookmark[];
    mapTileDarkUrl?: string | null;
    mapTileLightUrl?: string | null;
  };
  entitlements?: { entitled: boolean; status: string; graceUntil: string | null };
};

const UnitsContext = createContext<{
  unit: DistanceUnit;
  timezone: string | null;
  monthlyRecapEnabled: boolean;
  mapBookmarks: MapBookmark[];
  mapTileDarkUrl: string | null;
  mapTileLightUrl: string | null;
  entitlements: MeResponse['entitlements'] | undefined;
}>({
  unit: 'mi',
  timezone: null,
  monthlyRecapEnabled: false,
  mapBookmarks: [],
  mapTileDarkUrl: null,
  mapTileLightUrl: null,
  entitlements: undefined,
});

export function UnitsProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const enabled = Boolean(session?.user);
  const { data } = useQuery<MeResponse>({
    queryKey: ['me', session?.user?.id],
    queryFn: async () => {
      const res = await fetch('/api/me', { credentials: 'include' });
      if (!res.ok) throw new Error('me failed');
      return res.json() as Promise<MeResponse>;
    },
    enabled,
    staleTime: 60_000,
  });
  const value = useMemo(
    () => ({
      unit: data?.settings?.distanceUnit === 'km' ? ('km' as const) : ('mi' as const),
      timezone: data?.settings?.timezone ?? null,
      monthlyRecapEnabled: Boolean(data?.settings?.monthlyRecapEnabled),
      mapBookmarks: data?.settings?.mapBookmarks ?? [],
      mapTileDarkUrl: data?.settings?.mapTileDarkUrl ?? null,
      mapTileLightUrl: data?.settings?.mapTileLightUrl ?? null,
      entitlements: data?.entitlements,
    }),
    [data],
  );
  return <UnitsContext.Provider value={value}>{children}</UnitsContext.Provider>;
}

export function useUnits() {
  return useContext(UnitsContext);
}
