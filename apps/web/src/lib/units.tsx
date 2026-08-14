import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DistanceUnit } from '../utils/format';
import { useSession } from './auth';

type MeResponse = {
  settings?: {
    distanceUnit?: DistanceUnit;
    timezone?: string | null;
    monthlyRecapEnabled?: boolean;
  };
  entitlements?: { entitled: boolean; status: string; graceUntil: string | null };
};

const UnitsContext = createContext<{
  unit: DistanceUnit;
  timezone: string | null;
  monthlyRecapEnabled: boolean;
  entitlements: MeResponse['entitlements'] | undefined;
}>({ unit: 'mi', timezone: null, monthlyRecapEnabled: false, entitlements: undefined });

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
      entitlements: data?.entitlements,
    }),
    [data],
  );
  return <UnitsContext.Provider value={value}>{children}</UnitsContext.Provider>;
}

export function useUnits() {
  return useContext(UnitsContext);
}
