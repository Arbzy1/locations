import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardTitle } from '../ui/card';
import MarketingLayout from './MarketingLayout';

type Health = { ok?: boolean; worker?: string; db?: string };

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

  return (
    <MarketingLayout title="Status">
      <p>Public Worker and database checks. Counts only. No coordinates or place names.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardTitle>Worker</CardTitle>
          <p className="mt-2 text-text">{worker}</p>
        </Card>
        <Card>
          <CardTitle>Database</CardTitle>
          <p className="mt-2 text-text">{db}</p>
        </Card>
      </div>
    </MarketingLayout>
  );
}
