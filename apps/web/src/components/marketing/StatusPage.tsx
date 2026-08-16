import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardTitle } from '../ui/card';
import MarketingLayout from './MarketingLayout';
import { APP_VERSION_LABEL } from '../../lib/version';

type Health = { ok?: boolean; worker?: string; db?: string; version?: string };

export default function StatusPage() {
  const { data, isError, isPending } = useQuery<Health>({
    queryKey: ['public-health'],
    queryFn: async () => {
      const res = await fetch('/api/health');
      if (!res.ok) throw new Error('health');
      return res.json() as Promise<Health>;
    },
    refetchInterval: 30_000,
  });

  useEffect(() => {
    document.title = 'Status · Locations';
  }, []);

  const worker = isError ? 'error' : (data?.worker ?? (data?.ok ? 'ok' : isPending ? 'checking' : 'error'));
  const db = isError ? 'error' : (data?.db ?? (isPending ? 'checking' : 'error'));
  const version = data?.version ? `v${data.version.replace(/^v/i, '')}` : APP_VERSION_LABEL;

  return (
    <MarketingLayout title="Status">
      <p>Public Worker and database checks. Counts only. No coordinates or place names.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardTitle>Worker</CardTitle>
          <p className="mt-2 text-text">{worker}</p>
        </Card>
        <Card>
          <CardTitle>Database</CardTitle>
          <p className="mt-2 text-text">{db}</p>
        </Card>
        <Card>
          <CardTitle>Version</CardTitle>
          <p className="mt-2 font-mono tabular-nums text-text">{isPending ? 'checking' : version}</p>
        </Card>
      </div>
    </MarketingLayout>
  );
}
