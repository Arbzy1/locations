import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';
import MarketingLayout from './MarketingLayout';
import { APP_VERSION_LABEL } from '../../lib/version';
import { formatTime } from '../../utils/format';

type Health = {
  ok?: boolean;
  worker?: string;
  db?: string;
  version?: string;
  latencyMs: number;
  checkedAt: string;
};

type ServiceState = 'operational' | 'degraded' | 'checking';

function toServiceState(raw: string | undefined, isPending: boolean, isError: boolean): ServiceState {
  if (isPending) return 'checking';
  if (isError || !raw) return 'degraded';
  return raw === 'ok' || raw === 'healthy' || raw === 'operational' ? 'operational' : 'degraded';
}

function StatusBadge({ state, label }: { state: ServiceState; label: string }) {
  if (state === 'operational') {
    return (
      <Badge
        className="border-walk/40 bg-walk/10 text-walk"
        title={`${label}: Operational`}
      >
        Operational
      </Badge>
    );
  }
  if (state === 'checking') {
    return <Badge title={`${label}: Checking`}>Checking</Badge>;
  }
  return (
    <Badge
      className="border-destructive/40 bg-destructive/10 text-destructive"
      title={`${label}: Degraded`}
    >
      Degraded
    </Badge>
  );
}

export default function StatusPage() {
  const { data, isError, isPending, isFetching, refetch } = useQuery<Health>({
    queryKey: ['public-health'],
    queryFn: async () => {
      const started = performance.now();
      const res = await fetch('/api/health');
      const latencyMs = Math.max(1, Math.round(performance.now() - started));
      const checkedAt = new Date().toISOString();
      if (!res.ok) throw new Error('health');
      const json = (await res.json()) as Omit<Health, 'latencyMs' | 'checkedAt'>;
      return { ...json, latencyMs, checkedAt };
    },
    refetchInterval: 30_000,
  });

  useEffect(() => {
    document.title = 'Status · Locations';
  }, []);

  const workerState = toServiceState(
    data?.worker ?? (data?.ok ? 'ok' : undefined),
    isPending,
    isError,
  );
  const dbState = toServiceState(data?.db, isPending, isError);
  const overallState: ServiceState =
    isPending
      ? 'checking'
      : workerState === 'operational' && dbState === 'operational'
        ? 'operational'
        : 'degraded';
  const version = data?.version ? `v${data.version.replace(/^v/i, '')}` : APP_VERSION_LABEL;

  return (
    <MarketingLayout title="Status">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge state={overallState} label="Overall system" />
          <span className="text-xs text-text-muted">
            Public Worker and database checks. Counts only, no coordinates or place names.
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          title="Check Worker and database status again"
          disabled={isFetching}
          onClick={() => void refetch()}
        >
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : undefined} />
          {isFetching ? 'Checking…' : 'Check again'}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">Worker</CardTitle>
            <StatusBadge state={workerState} label="Worker" />
          </div>
          <p className="mt-2 text-xs text-text-muted">Edge API and static asset delivery</p>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">Database</CardTitle>
            <StatusBadge state={dbState} label="Database" />
          </div>
          <p className="mt-2 text-xs text-text-muted">Postgres connectivity and RLS session check</p>
        </Card>

        <Card>
          <CardTitle className="text-base">Latency</CardTitle>
          <p className="mt-2 font-mono text-base tabular-nums text-text">
            {data ? `${data.latencyMs} ms` : isPending ? 'Checking…' : 'Unavailable'}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            {data?.checkedAt ? `Last checked at ${formatTime(data.checkedAt)}` : 'Awaiting health response'}
          </p>
        </Card>

        <Card>
          <CardTitle className="text-base">Version</CardTitle>
          <p className="mt-2 font-mono text-base tabular-nums text-text">
            {isPending ? 'Checking…' : version}
          </p>
          <p className="mt-1 text-xs text-text-muted">Deployed build identifier</p>
        </Card>
      </div>
    </MarketingLayout>
  );
}
