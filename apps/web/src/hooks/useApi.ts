import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DayData,
  Overview,
  HeatmapPoint,
  MonthlyStats,
  YearlyStats,
  DayTrip,
  FunFact,
  RouteProgress,
  DataSourceInfo,
  ImportStatus,
} from '../types';
import { useSession } from '../lib/auth';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'include' });
  if (res.status === 401) {
    throw new Error('401 Unauthorized');
  }
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function useTenantKey() {
  const { data: session } = useSession();
  const user = session?.user as { id?: string; role?: string } | undefined;
  return user?.id ? `${user.role ?? 'user'}:${user.id}` : 'anon';
}

export function useOverview() {
  const tenantKey = useTenantKey();
  return useQuery<Overview>({
    queryKey: ['overview', tenantKey],
    queryFn: () => fetchJson('/api/overview'),
    staleTime: Infinity,
    enabled: tenantKey !== 'anon',
  });
}

export function useDays() {
  const tenantKey = useTenantKey();
  return useQuery<string[]>({
    queryKey: ['days', tenantKey],
    queryFn: () => fetchJson('/api/days'),
    staleTime: Infinity,
    enabled: tenantKey !== 'anon',
  });
}

export function useDayData(date: string) {
  const tenantKey = useTenantKey();
  return useQuery<DayData>({
    queryKey: ['day', tenantKey, date],
    queryFn: () => fetchJson(`/api/day/${date}`),
    enabled: !!date && tenantKey !== 'anon',
    staleTime: Infinity,
  });
}

export function useHeatmap() {
  const tenantKey = useTenantKey();
  return useQuery<HeatmapPoint[]>({
    queryKey: ['heatmap', tenantKey],
    queryFn: () => fetchJson('/api/heatmap'),
    staleTime: Infinity,
    enabled: tenantKey !== 'anon',
  });
}

export function useMonthlyStats() {
  const tenantKey = useTenantKey();
  return useQuery<MonthlyStats[]>({
    queryKey: ['monthly', tenantKey],
    queryFn: () => fetchJson('/api/analytics/monthly'),
    staleTime: Infinity,
    enabled: tenantKey !== 'anon',
  });
}

export function useYearlyStats() {
  const tenantKey = useTenantKey();
  return useQuery<YearlyStats[]>({
    queryKey: ['yearly', tenantKey],
    queryFn: () => fetchJson('/api/analytics/yearly'),
    staleTime: Infinity,
    enabled: tenantKey !== 'anon',
  });
}

export function useDayTrips() {
  const tenantKey = useTenantKey();
  return useQuery<DayTrip[]>({
    queryKey: ['day-trips', tenantKey],
    queryFn: () => fetchJson('/api/analytics/day-trips'),
    staleTime: Infinity,
    enabled: tenantKey !== 'anon',
  });
}

export function useCorridors() {
  const tenantKey = useTenantKey();
  return useQuery<{ from: string; to: string; count: number }[]>({
    queryKey: ['corridors', tenantKey],
    queryFn: () => fetchJson('/api/analytics/corridors'),
    staleTime: Infinity,
    enabled: tenantKey !== 'anon',
  });
}

export function useFunFacts() {
  const tenantKey = useTenantKey();
  return useQuery<FunFact[]>({
    queryKey: ['facts', tenantKey],
    queryFn: () => fetchJson('/api/analytics/facts'),
    staleTime: Infinity,
    enabled: tenantKey !== 'anon',
  });
}

export function useRouteProgress() {
  const tenantKey = useTenantKey();
  return useQuery<RouteProgress>({
    queryKey: ['route-progress', tenantKey],
    queryFn: () => fetchJson('/api/route-progress'),
    enabled: tenantKey !== 'anon',
    refetchInterval: (query) => (query.state.data?.running ? 5000 : false),
  });
}

export function useSources() {
  const tenantKey = useTenantKey();
  return useQuery<DataSourceInfo[]>({
    queryKey: ['sources', tenantKey],
    queryFn: () => fetchJson('/api/sources'),
    enabled: tenantKey !== 'anon',
  });
}

export function useImportStatus(opts?: { poll?: boolean }) {
  const tenantKey = useTenantKey();
  return useQuery<ImportStatus>({
    queryKey: ['import-status', tenantKey],
    queryFn: () => fetchJson('/api/import/status'),
    enabled: tenantKey !== 'anon',
    refetchInterval: (query) => {
      const status = query.state.data?.latestJob?.status;
      const busy = status === 'pending' || status === 'processing';
      if (opts?.poll || busy) return busy ? 1500 : false;
      return false;
    },
  });
}

export function useInvalidateLocationQueries() {
  const queryClient = useQueryClient();
  const tenantKey = useTenantKey();
  return useCallback(() => {
    void queryClient.invalidateQueries({
      predicate: (q) => {
        const key = q.queryKey[1];
        return key === tenantKey;
      },
    });
  }, [queryClient, tenantKey]);
}
