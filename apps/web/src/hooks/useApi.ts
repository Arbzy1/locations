import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DayData,
  DaySummary,
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
): Promise<DayData> {
  const res = await fetch(`/api/day/${date}?stream=1`, {
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
    const line = detail ? `${stage} — ${detail}` : stage;
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

export function useDayData(date: string) {
  const tenantKey = useTenantKey();
  const [progress, setProgress] = useState<DayLoadProgress | null>(null);

  const query = useQuery<DayData>({
    queryKey: ['day', tenantKey, date],
    queryFn: ({ signal }) => {
      setProgress({ stage: 'Starting', percent: 0, logs: ['Starting…'] });
      return fetchDayStreaming(date, setProgress, signal);
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
