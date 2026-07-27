import { useQuery } from '@tanstack/react-query';
import type {
  DayData,
  Overview,
  HeatmapPoint,
  MonthlyStats,
  YearlyStats,
  DayTrip,
  FunFact,
  RouteProgress,
} from '../types';

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

export function useOverview() {
  return useQuery<Overview>({
    queryKey: ['overview'],
    queryFn: () => fetchJson('/api/overview'),
    staleTime: Infinity,
  });
}

export function useDays() {
  return useQuery<string[]>({
    queryKey: ['days'],
    queryFn: () => fetchJson('/api/days'),
    staleTime: Infinity,
  });
}

export function useDayData(date: string) {
  return useQuery<DayData>({
    queryKey: ['day', date],
    queryFn: () => fetchJson(`/api/day/${date}`),
    enabled: !!date,
    staleTime: Infinity,
  });
}

export function useHeatmap() {
  return useQuery<HeatmapPoint[]>({
    queryKey: ['heatmap'],
    queryFn: () => fetchJson('/api/heatmap'),
    staleTime: Infinity,
  });
}

export function useMonthlyStats() {
  return useQuery<MonthlyStats[]>({
    queryKey: ['monthly'],
    queryFn: () => fetchJson('/api/analytics/monthly'),
    staleTime: Infinity,
  });
}

export function useYearlyStats() {
  return useQuery<YearlyStats[]>({
    queryKey: ['yearly'],
    queryFn: () => fetchJson('/api/analytics/yearly'),
    staleTime: Infinity,
  });
}

export function useDayTrips() {
  return useQuery<DayTrip[]>({
    queryKey: ['day-trips'],
    queryFn: () => fetchJson('/api/analytics/day-trips'),
    staleTime: Infinity,
  });
}

export function useCorridors() {
  return useQuery<{ from: string; to: string; count: number }[]>({
    queryKey: ['corridors'],
    queryFn: () => fetchJson('/api/analytics/corridors'),
    staleTime: Infinity,
  });
}

export function useFunFacts() {
  return useQuery<FunFact[]>({
    queryKey: ['facts'],
    queryFn: () => fetchJson('/api/analytics/facts'),
    staleTime: Infinity,
  });
}

export function useRouteProgress() {
  return useQuery<RouteProgress>({
    queryKey: ['route-progress'],
    queryFn: () => fetchJson('/api/route-progress'),
    refetchInterval: (query) => (query.state.data?.running ? 5000 : false),
  });
}
