import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient, useQueries } from '@tanstack/react-query';
import type {
  DayData,
  DaySummary,
  Overview,
  HeatmapPoint,
  MonthlyStats,
  YearlyStats,
  DayTrip,
  FunFact,
  FlightSummary,
  TrainHop,
  LowMovementDay,
  MultiDayTrip,
  Streaks,
  PlaceDeltaMonth,
  LapsedPlace,
  PersonalityTag,
  YearInReviewChapter,
  RouteProgress,
  DataSourceInfo,
  ImportStatus,
} from '../types';
import { useSession } from '../lib/auth';
import { pickLatestYearReview } from '../lib/explorer/year-review';

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
  return useQuery<DaySummary[]>({
    queryKey: ['days', tenantKey],
    queryFn: () => fetchJson('/api/days'),
    staleTime: Infinity,
    enabled: tenantKey !== 'anon',
  });
}

export type DayLoadProgress = {
  stage: string;
  detail?: string;
  percent: number;
  done?: number;
  total?: number;
  logs: string[];
};

async function fetchDayStreaming(
  date: string,
  onProgress: (p: DayLoadProgress) => void,
  signal?: AbortSignal,
  sourceIds?: string[],
): Promise<DayData> {
  const params = new URLSearchParams({ stream: '1' });
  if (sourceIds?.length) params.set('sources', sourceIds.join(','));
  const res = await fetch(`/api/day/${date}?${params.toString()}`, {
    credentials: 'include',
    signal,
  });
  if (res.status === 401) throw new Error('401 Unauthorized');
  if (!res.ok || !res.body) {
    throw new Error(`Request failed: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const logs: string[] = [];
  let result: DayData | null = null;
  let streamError: string | null = null;

  const pushLog = (stage: string, detail?: string) => {
    const line = detail ? `${stage}: ${detail}` : stage;
    if (logs[logs.length - 1] !== line) {
      logs.push(line);
      if (logs.length > 12) logs.shift();
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const msg = JSON.parse(trimmed) as {
        type: string;
        stage?: string;
        detail?: string;
        percent?: number;
        done?: number;
        total?: number;
        data?: DayData;
        error?: string;
      };
      if (msg.type === 'progress') {
        pushLog(msg.stage ?? 'Working', msg.detail);
        onProgress({
          stage: msg.stage ?? 'Working',
          detail: msg.detail,
          percent: msg.percent ?? 0,
          done: msg.done,
          total: msg.total,
          logs: [...logs],
        });
      } else if (msg.type === 'result' && msg.data) {
        result = msg.data;
      } else if (msg.type === 'error') {
        streamError = msg.error ?? 'Failed to load day';
      }
    }
  }

  if (streamError) throw new Error(streamError);
  if (!result) throw new Error('No data for this date');
  return result;
}

export function useDayData(date: string, sourceIds?: string[]) {
  const tenantKey = useTenantKey();
  const [progress, setProgress] = useState<DayLoadProgress | null>(null);
  const sourceKey = sourceIds?.slice().sort().join(',') ?? '';

  const query = useQuery<DayData>({
    queryKey: ['day', tenantKey, date, sourceKey],
    queryFn: ({ signal }) => {
      setProgress({ stage: 'Starting', percent: 0, logs: ['Starting…'] });
      return fetchDayStreaming(date, setProgress, signal, sourceIds);
    },
    enabled: !!date && tenantKey !== 'anon',
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!query.isFetching) {
      // keep last progress briefly; clear when settled with data
      if (query.isSuccess) setProgress(null);
    }
  }, [query.isFetching, query.isSuccess]);

  return { ...query, progress };
}

export function useHeatmap(opts?: { sources?: string[]; from?: string; to?: string }) {
  const tenantKey = useTenantKey();
  const params = new URLSearchParams();
  if (opts?.sources?.length) params.set('sources', opts.sources.join(','));
  if (opts?.from) params.set('from', opts.from);
  if (opts?.to) params.set('to', opts.to);
  const qs = params.toString();
  return useQuery<HeatmapPoint[]>({
    queryKey: ['heatmap', tenantKey, qs],
    queryFn: () => fetchJson(`/api/heatmap${qs ? `?${qs}` : ''}`),
    staleTime: Infinity,
    enabled: tenantKey !== 'anon',
  });
}

export function useHeatmapLayers(
  sourceIds: string[] | undefined,
  opts?: { from?: string; to?: string },
) {
  const tenantKey = useTenantKey();
  const ids = sourceIds ?? [];
  return useQueries({
    queries: ids.map((id) => {
      const params = new URLSearchParams();
      params.set('sources', id);
      if (opts?.from) params.set('from', opts.from);
      if (opts?.to) params.set('to', opts.to);
      const qs = params.toString();
      return {
        queryKey: ['heatmap', tenantKey, qs],
        queryFn: () => fetchJson<HeatmapPoint[]>(`/api/heatmap?${qs}`),
        staleTime: Infinity,
        enabled: tenantKey !== 'anon' && ids.length > 1,
      };
    }),
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

export function useSearch(q: string) {
  const tenantKey = useTenantKey();
  return useQuery<{
    places: { cluster: string; label?: string; lat: number; lon: number; date: string }[];
    days: { date: string }[];
  }>({
    queryKey: ['search', tenantKey, q],
    queryFn: () => fetchJson(`/api/search?q=${encodeURIComponent(q)}`),
    enabled: tenantKey !== 'anon' && q.trim().length >= 2,
    staleTime: 30_000,
  });
}

export function usePlaceLabels() {
  const tenantKey = useTenantKey();
  return useQuery<{
    placeKey: string;
    label: string;
    hidden: boolean;
    favourite?: boolean;
    color?: string | null;
    tags?: string[];
  }[]>({
    queryKey: ['place-labels', tenantKey],
    queryFn: () => fetchJson('/api/places/labels'),
    enabled: tenantKey !== 'anon',
  });
}

export function useHomeWork() {
  const tenantKey = useTenantKey();
  return useQuery<{
    home: { cluster: string; visits: number } | null;
    work: { cluster: string; visits: number } | null;
  }>({
    queryKey: ['home-work', tenantKey],
    queryFn: () => fetchJson('/api/analytics/home-work'),
    staleTime: Infinity,
    enabled: tenantKey !== 'anon',
  });
}

export function useYearInReview() {
  const tenantKey = useTenantKey();
  return useQuery<YearInReviewChapter | null>({
    queryKey: ['year-in-review', tenantKey],
    queryFn: async () => pickLatestYearReview(await fetchJson('/api/analytics/year-in-review')),
    staleTime: Infinity,
    enabled: tenantKey !== 'anon',
  });
}

export function useAreas() {
  const tenantKey = useTenantKey();
  return useQuery<{ cluster: string; visits: number; lat: number; lon: number }[]>({
    queryKey: ['areas', tenantKey],
    queryFn: () => fetchJson('/api/analytics/areas'),
    staleTime: Infinity,
    enabled: tenantKey !== 'anon',
  });
}

export function useMultiDayTrips() {
  const tenantKey = useTenantKey();
  return useQuery<MultiDayTrip[]>({
    queryKey: ['multi-day', tenantKey],
    queryFn: () => fetchJson('/api/analytics/multi-day'),
    staleTime: Infinity,
    enabled: tenantKey !== 'anon',
  });
}

export function useFlights() {
  const tenantKey = useTenantKey();
  return useQuery<FlightSummary | []>({
    queryKey: ['flights', tenantKey],
    queryFn: () => fetchJson('/api/analytics/flights'),
    staleTime: Infinity,
    enabled: tenantKey !== 'anon',
  });
}

export function useTrainHops() {
  const tenantKey = useTenantKey();
  return useQuery<TrainHop[]>({
    queryKey: ['train-hops', tenantKey],
    queryFn: () => fetchJson('/api/analytics/train-hops'),
    staleTime: Infinity,
    enabled: tenantKey !== 'anon',
  });
}

export function useLowMovementDays() {
  const tenantKey = useTenantKey();
  return useQuery<LowMovementDay[]>({
    queryKey: ['low-movement', tenantKey],
    queryFn: () => fetchJson('/api/analytics/low-movement'),
    staleTime: Infinity,
    enabled: tenantKey !== 'anon',
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
    void queryClient.invalidateQueries({ queryKey: ['me'] });
  }, [queryClient, tenantKey]);
}

export function useClusters(q: string, sort: string) {
  const tenantKey = useTenantKey();
  return useQuery<{
    clusters: {
      cluster: string;
      label: string;
      visits: number;
      duration_minutes: number;
      lat: number;
      lon: number;
      first: string;
      last: string;
    }[];
    cursor: string | null;
  }>({
    queryKey: ['clusters', tenantKey, q, sort],
    queryFn: () =>
      fetchJson(`/api/clusters?q=${encodeURIComponent(q)}&sort=${encodeURIComponent(sort)}&limit=80`),
    enabled: tenantKey !== 'anon',
  });
}

export function useCluster(key: string) {
  const tenantKey = useTenantKey();
  return useQuery<{
    cluster: string;
    label: string;
    hidden: boolean;
    visits: number;
    duration_minutes: number;
    lat: number;
    lon: number;
    first: string;
    last: string;
    hour_histogram: number[];
    corridors: { from: string; to: string; count: number }[];
  }>({
    queryKey: ['cluster', tenantKey, key],
    queryFn: () => fetchJson(`/api/clusters/${encodeURIComponent(key)}`),
    enabled: tenantKey !== 'anon' && !!key,
  });
}

export function useClusterVisits(key: string) {
  const tenantKey = useTenantKey();
  return useQuery<{
    visits: {
      date: string;
      start: string;
      end: string;
      duration_minutes: number;
      semantic_type: string;
      lat: number;
      lon: number;
    }[];
  }>({
    queryKey: ['cluster-visits', tenantKey, key],
    queryFn: () => fetchJson(`/api/clusters/${encodeURIComponent(key)}/visits?limit=40`),
    enabled: tenantKey !== 'anon' && !!key,
  });
}

export function useCorridorDetail(a: string, b: string) {
  const tenantKey = useTenantKey();
  return useQuery<{
    from: string;
    to: string;
    count: number;
    from_lat: number | null;
    from_lon: number | null;
    to_lat: number | null;
    to_lon: number | null;
    transitions: { date: string; from: string; to: string; mode: string; duration_minutes: number }[];
  }>({
    queryKey: ['corridor', tenantKey, a, b],
    queryFn: () => fetchJson(`/api/corridors/${encodeURIComponent(a)}/${encodeURIComponent(b)}`),
    enabled: tenantKey !== 'anon' && !!a && !!b,
  });
}

export function useTripRange(start: string, end: string) {
  const tenantKey = useTenantKey();
  return useQuery<{
    start: string;
    end: string;
    dates: string[];
    truncated: boolean;
    total_miles: number;
    visits: {
      start: string;
      end: string;
      lat: number;
      lon: number;
      cluster: string;
      semantic_type: string;
      duration_minutes: number;
    }[];
    activities: {
      start: string;
      end: string;
      start_lat: number;
      start_lon: number;
      end_lat: number;
      end_lon: number;
      mode: string;
      distance_meters: number;
      duration_minutes: number;
    }[];
  }>({
    queryKey: ['trip-range', tenantKey, start, end],
    queryFn: () => fetchJson(`/api/trip-range/${start}/${end}`),
    enabled: tenantKey !== 'anon' && !!start && !!end,
  });
}

export function useNamedTrips() {
  const tenantKey = useTenantKey();
  return useQuery<{ id: string; name: string; start: string; end: string; dates: string[] }[]>({
    queryKey: ['named-trips', tenantKey],
    queryFn: () => fetchJson('/api/trips'),
    enabled: tenantKey !== 'anon',
  });
}

export function useChapters() {
  const tenantKey = useTenantKey();
  return useQuery<{ id: string; name: string; start: string; end: string }[]>({
    queryKey: ['chapters', tenantKey],
    queryFn: () => fetchJson('/api/chapters'),
    enabled: tenantKey !== 'anon',
  });
}

export function useImportJobs() {
  const tenantKey = useTenantKey();
  return useQuery<
    {
      id: string;
      sourceId: string;
      status: string;
      error: string | null;
      visitCount: number | null;
      activityCount: number | null;
      parsedCount: number | null;
      merge?: boolean;
      chosenFile?: string | null;
      createdAt: string;
      updatedAt: string;
    }[]
  >({
    queryKey: ['import-jobs', tenantKey],
    queryFn: () => fetchJson('/api/import/jobs'),
    enabled: tenantKey !== 'anon',
  });
}

export function useAdminStats() {
  const tenantKey = useTenantKey();
  return useQuery<{
    visitCount: number;
    sourceCount: number;
    latestJobStatus: string | null;
    recentJobCount: number;
    stuckJobCount: number;
    stuckJobs: {
      id: string;
      status: string;
      ageMinutes: number;
      parsedCount: number;
      visitCount: number;
      error: string | null;
    }[];
    recentJobs: {
      id: string;
      status: string;
      ageMinutes: number;
      parsedCount: number;
      visitCount: number;
      error: string | null;
    }[];
  }>({
    queryKey: ['admin-stats', tenantKey],
    queryFn: () => fetchJson('/api/admin/stats'),
    enabled: tenantKey !== 'anon',
    retry: false,
  });
}

export function useCachedAnalytics<T>(key: string) {
  const tenantKey = useTenantKey();
  return useQuery<T>({
    queryKey: ['analytics', tenantKey, key],
    queryFn: () => fetchJson(`/api/analytics/${key}`),
    staleTime: Infinity,
    enabled: tenantKey !== 'anon',
  });
}

export function useYearReview(year?: number) {
  const tenantKey = useTenantKey();
  const qs = year ? `?year=${year}` : '';
  return useQuery<YearInReviewChapter | null>({
    queryKey: ['year-in-review', tenantKey, year ?? 'latest'],
    queryFn: async () => {
      const data = await fetchJson(`/api/analytics/year-in-review${qs}`);
      if (year) {
        if (!data || Array.isArray(data)) return null;
        return data as YearInReviewChapter;
      }
      return pickLatestYearReview(data);
    },
    staleTime: Infinity,
    enabled: tenantKey !== 'anon' && (year == null || Number.isFinite(year)),
  });
}

export function useStreaks() {
  return useCachedAnalytics<Streaks | []>('streaks');
}

export function usePlaceDeltas() {
  return useCachedAnalytics<PlaceDeltaMonth[] | []>('place-deltas');
}

export function useLapsedPlaces() {
  return useCachedAnalytics<LapsedPlace[] | []>('lapsed-places');
}

export function useHourOfWeek() {
  return useCachedAnalytics<number[][] | []>('hour-of-week');
}

export function usePersonality() {
  return useCachedAnalytics<PersonalityTag[] | []>('personality');
}

export function usePublicConfig() {
  return useQuery<{
    signupDisabled?: boolean;
    googleAuth?: boolean;
    globe?: boolean;
    billingConfigured?: boolean;
    customTiles?: boolean;
    customTileHosts?: string[];
    mapStyleDark?: string | null;
    mapStyleLight?: string | null;
    flags?: { globe?: boolean; demoTour?: boolean; landing?: boolean };
  }>({
    queryKey: ['public-config'],
    queryFn: () => fetchJson('/api/config'),
    staleTime: 60_000,
  });
}
