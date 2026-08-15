import { Link } from 'react-router-dom';
import { useState } from 'react';
import CatalogPage from './CatalogPage';
import MapView from '../explorer/Map';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { EjectField } from '../ui/eject-field';
import {
  useCachedAnalytics,
  useChapters,
  useHeatmap,
  useInvalidateLocationQueries,
} from '../../hooks/useApi';
import { placePath } from '../../lib/nav/paths';
import { useSession } from '../../lib/auth';
import type { ActivityGuessCount, BadgeSummary } from '../../types';

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
          <EjectField label="Chapter name" htmlFor="chapter-name" className="min-w-0 flex-1">
            <Input id="chapter-name" title="Chapter name" value={name} onChange={(e) => setName(e.target.value)} />
          </EjectField>
          <EjectField label="Start date" htmlFor="chapter-start">
            <Input id="chapter-start" title="Start date" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </EjectField>
          <EjectField label="End date" htmlFor="chapter-end">
            <Input id="chapter-end" title="End date" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </EjectField>
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

export function BadgesPage() {
  const { data } = useCachedAnalytics<BadgeSummary>('badges');
  const summary = data && !Array.isArray(data) ? data : null;
  return (
    <CatalogPage
      title="Badges"
      description="Coverage percent and visit counts from your import. Not a live streak with anyone else."
    >
      {summary ? (
        <>
          <p className="text-sm text-text">
            {summary.coveragePercent}% of days in the span have Timeline ({summary.daysWithData} of{' '}
            {summary.spanDays}).
          </p>
          <ul className="space-y-2">
            {summary.badges.map((b) => (
              <li
                key={b.id}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  b.earned ? 'border-accent/40 bg-accent/10 text-text' : 'border-border bg-bg text-text-muted'
                }`}
              >
                <div className="font-semibold">{b.label}</div>
                <div className="text-xs">{b.detail}</div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-text-muted">Badges appear after the next Timeline import.</p>
      )}
    </CatalogPage>
  );
}

export function GuessesPage() {
  const { data } = useCachedAnalytics<ActivityGuessCount[]>('activity-guesses');
  const rows = Array.isArray(data) ? data : [];
  return (
    <CatalogPage
      title="Activity guesses"
      description="Labels from dwell time, hour of day, and Google place type. Not an LLM. Place names stay off this list."
    >
      <ul className="space-y-1 text-sm">
        {rows.map((r) => (
          <li key={r.id} className="flex h-11 items-center justify-between rounded-lg border border-border bg-bg px-3">
            <span className="text-text">{r.label}</span>
            <span className="text-text-muted">{r.count}</span>
          </li>
        ))}
      </ul>
      {rows.length === 0 && (
        <p className="text-sm text-text-muted">Guesses appear after the next Timeline import.</p>
      )}
    </CatalogPage>
  );
}
