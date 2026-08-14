import { Link } from 'react-router-dom';
import { useState } from 'react';
import CatalogPage from './CatalogPage';
import MapView from '../Map';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  useCachedAnalytics,
  useChapters,
  useHeatmap,
  useInvalidateLocationQueries,
} from '../../hooks/useApi';
import { placePath } from '../../lib/paths';
import { useSession } from '../../lib/auth';

export function FirstsPage() {
  const { data } = useCachedAnalytics<{ clusters: { name: string; date: string }[]; types: { name: string; date: string }[] }>(
    'firsts',
  );
  const clusters = data && !Array.isArray(data) ? data.clusters : [];
  const types = data && !Array.isArray(data) ? data.types : [];
  return (
    <CatalogPage title="Firsts" description="First imported visit to each cluster and place type.">
      <h3 className="text-sm font-semibold text-text-muted">Places</h3>
      <ul className="space-y-1">
        {clusters.map((r) => (
          <li key={r.name} className="flex items-center gap-2">
            <Button variant="ghost" asChild title={`Open ${r.name}`} className="h-11 min-w-0 flex-1 justify-between font-normal">
              <Link to={placePath(r.name)}>
                <span className="truncate">{r.name}</span>
              </Link>
            </Button>
            <Button variant="ghost" asChild title={`Open ${r.date}`} className="h-11 shrink-0">
              <Link to={`/day/${r.date}`}>{r.date}</Link>
            </Button>
          </li>
        ))}
      </ul>
      <h3 className="text-sm font-semibold text-text-muted">Types</h3>
      <ul className="space-y-1 text-sm">
        {types.map((r) => (
          <li key={r.name} className="flex justify-between">
            <span>{r.name}</span>
            <Link className="text-accent" to={`/day/${r.date}`} title={`Open ${r.date}`}>
              {r.date}
            </Link>
          </li>
        ))}
      </ul>
    </CatalogPage>
  );
}

export function MovingPage() {
  const { data } = useCachedAnalytics<{ year: number; cluster: string; nights: number }[]>('moving');
  const rows = Array.isArray(data) ? data : [];
  return (
    <CatalogPage title="Moving history" description="Overnight cluster with the most nights each year. Labelled as a guess.">
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.year}>
            <Button variant="ghost" asChild title={`Open ${r.cluster}`} className="h-11 w-full justify-between font-normal">
              <Link to={placePath(r.cluster)}>
                <span>
                  {r.year}: {r.cluster}
                </span>
                <span className="text-xs text-text-muted">{r.nights} nights</span>
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </CatalogPage>
  );
}

export function AnomalyPage() {
  const { data } = useCachedAnalytics<{ date: string; weekday: number; miles: number; visits: number; reason: string }[]>(
    'anomaly',
  );
  const rows = Array.isArray(data) ? data : [];
  return (
    <CatalogPage title="Routine vs anomaly" description="Days that differ a lot from the typical same weekday. Not machine learning.">
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.date}>
            <Button variant="ghost" asChild title={`Open ${r.date}`} className="h-11 w-full justify-between font-normal">
              <Link to={`/day/${r.date}`}>
                <span>{r.date}</span>
                <span className="truncate text-xs text-text-muted">{r.reason}</span>
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </CatalogPage>
  );
}

export function ChaptersPage() {
  const { data: session } = useSession();
  const isDemo = (session?.user as { role?: string } | undefined)?.role === 'demo';
  const { data: chapters = [] } = useChapters();
  const { data: heatmap } = useHeatmap();
  const invalidate = useInvalidateLocationQueries();
  const [name, setName] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [selected, setSelected] = useState<{ start: string; end: string } | null>(null);
  const save = async () => {
    await fetch('/api/chapters', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, start, end }),
    });
    setName('');
    invalidate();
  };
  return (
    <CatalogPage title="Life chapters" description="Your names for date ranges. Private to this account.">
      {isDemo ? (
        <p className="text-sm text-text-muted">Demo accounts cannot save chapters.</p>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input title="Chapter name" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input title="Start date" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          <Input title="End date" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          <Button type="button" title="Save chapter" disabled={!name.trim() || !start || !end} onClick={() => void save()}>
            Save
          </Button>
        </div>
      )}
      <ul className="space-y-1">
        {chapters.map((c) => (
          <li key={c.id}>
            <Button
              variant="ghost"
              title={`Show heatmap for ${c.name}`}
              className="h-11 w-full justify-between font-normal"
              onClick={() => setSelected({ start: c.start, end: c.end })}
            >
              <span>{c.name}</span>
              <span className="text-xs text-text-muted">
                {c.start} to {c.end}
              </span>
            </Button>
          </li>
        ))}
      </ul>
      <ChapterMap start={selected?.start} end={selected?.end} fallback={heatmap} />
    </CatalogPage>
  );
}

function ChapterMap({
  start,
  end,
  fallback,
}: {
  start?: string;
  end?: string;
  fallback?: { lat: number; lon: number; count: number }[];
}) {
  const { data } = useHeatmap({ from: start, to: end });
  const points = start ? data : fallback;
  return (
    <div className="h-56 overflow-hidden rounded-lg border border-border">
      <MapView compact heatmapPoints={points || []} />
    </div>
  );
}
