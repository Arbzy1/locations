import { Link, useNavigate, useParams } from 'react-router-dom';
import { useState } from 'react';
import CatalogPage from './CatalogPage';
import MapView from '../explorer/Map';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  useCachedAnalytics,
  useDays,
  useHomeWork,
  useInvalidateLocationQueries,
  useMultiDayTrips,
  useNamedTrips,
  useTripRange,
} from '../../hooks/useApi';
import { formatMilesOrKm } from '../../utils/format';
import { useUnits } from '../../lib/units';
import { MODE_LABELS } from '../../types';
import { placePath, tripPath } from '../../lib/paths';
import { useSession } from '../../lib/auth';

export function TripStoryPage() {
  const { start = '', end = '' } = useParams();
  const { data } = useTripRange(start, end);
  const { unit } = useUnits();
  if (!data) {
    return (
      <CatalogPage title="Trip">
        <p className="text-sm text-text-muted">Loading…</p>
      </CatalogPage>
    );
  }
  return (
    <CatalogPage
      title={`${data.start} to ${data.end}`}
      description={`${formatMilesOrKm(data.total_miles, unit)}${data.truncated ? ' · first 14 days shown' : ''}`}
    >
      <div className="h-64 overflow-hidden rounded-lg border border-border">
        <MapView compact visits={data.visits} activities={data.activities} />
      </div>
      <ul className="space-y-1">
        {data.dates.map((d) => (
          <li key={d}>
            <Button variant="ghost" asChild title={`Open ${d}`} className="h-11 w-full justify-start font-normal">
              <Link to={`/day/${d}`}>{d}</Link>
            </Button>
          </li>
        ))}
      </ul>
    </CatalogPage>
  );
}

export function TripBuilderPage() {
  const { data: multi = [] } = useMultiDayTrips();
  const { data: named = [] } = useNamedTrips();
  const invalidate = useInvalidateLocationQueries();
  const { data: session } = useSession();
  const isDemo = (session?.user as { role?: string } | undefined)?.role === 'demo';
  const [name, setName] = useState('');
  const [start, setStart] = useState(multi[0]?.start ?? '');
  const [end, setEnd] = useState(multi[0]?.end ?? '');
  const save = async () => {
    await fetch('/api/trips', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, start, end }),
    });
    setName('');
    invalidate();
  };
  return (
    <CatalogPage title="Name a trip" description="Save a multi-day range. No photos.">
      {isDemo ? (
        <p className="text-sm text-text-muted">Demo accounts cannot save named trips.</p>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input title="Trip name" placeholder="Trip name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input title="Start date" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          <Input title="End date" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          <Button type="button" title="Save named trip" disabled={!name.trim() || !start || !end} onClick={() => void save()}>
            Save
          </Button>
        </div>
      )}
      <h3 className="text-sm font-semibold text-text-muted">Saved</h3>
      <ul className="space-y-1">
        {named.map((t) => (
          <li key={t.id}>
            <Button variant="ghost" asChild title={`Open ${t.name}`} className="h-11 w-full justify-between font-normal">
              <Link to={tripPath(t.start, t.end)}>
                <span>{t.name}</span>
                <span className="text-xs text-text-muted">
                  {t.start} to {t.end}
                </span>
              </Link>
            </Button>
          </li>
        ))}
      </ul>
      <h3 className="text-sm font-semibold text-text-muted">Detected multi-day</h3>
      <ul className="space-y-1">
        {multi.slice(0, 20).map((t) => (
          <li key={`${t.start}-${t.end}`}>
            <Button variant="ghost" asChild title="Open trip" className="h-11 w-full justify-between font-normal">
              <Link to={tripPath(t.start, t.end)}>
                <span>
                  {t.start} to {t.end}
                </span>
                <span className="text-xs text-text-muted">{t.clusters.slice(0, 3).join(', ')}</span>
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </CatalogPage>
  );
}

export function HolidaysPage() {
  const { data } = useCachedAnalytics<{ date: string; cluster: string }[]>('away-nights');
  const rows = Array.isArray(data) ? data : [];
  return (
    <CatalogPage
      title="Away nights"
      description="Overnight visits whose cluster is not the home guess. This is a guess, not a confirmed address."
    >
      <ul className="space-y-1">
        {rows.slice(0, 80).map((r) => (
          <li key={`${r.date}-${r.cluster}`}>
            <Button variant="ghost" asChild title={`Open ${r.date}`} className="h-11 w-full justify-between font-normal">
              <Link to={`/day/${r.date}`}>
                <span>{r.date}</span>
                <span className="truncate text-xs text-text-muted">{r.cluster}</span>
              </Link>
            </Button>
          </li>
        ))}
        {rows.length === 0 && (
          <p className="text-sm text-text-muted">No away nights in the analytics cache yet. Re-import Timeline to compute them.</p>
        )}
      </ul>
    </CatalogPage>
  );
}

export function CommutePage() {
  const { data } = useCachedAnalytics<{
    home: string;
    work: string;
    count: number;
    modes: Record<string, number>;
    departHours: number[];
  } | null>('commute');
  const { data: hw } = useHomeWork();
  if (!data || Array.isArray(data)) {
    return (
      <CatalogPage title="Commute" description="Weekday home to work loops from overnight and weekday guesses.">
        <p className="text-sm text-text-muted">
          {hw?.home && hw?.work
            ? 'Commute stats appear after the next import.'
            : 'Home or work could not be guessed yet.'}
        </p>
      </CatalogPage>
    );
  }
  return (
    <CatalogPage title="Commute" description={`${data.count} weekday home/work transitions.`}>
      <p className="text-sm">
        Home guess: <Link className="text-accent underline" to={placePath(data.home)} title="Open home guess">{data.home}</Link>
      </p>
      <p className="text-sm">
        Work guess: <Link className="text-accent underline" to={placePath(data.work)} title="Open work guess">{data.work}</Link>
      </p>
      <div className="flex flex-wrap gap-2">
        {Object.entries(data.modes).map(([mode, n]) => (
          <span key={mode} className="rounded-full border border-border px-2 py-1 text-xs">
            {MODE_LABELS[mode] || mode} · {n}
          </span>
        ))}
      </div>
    </CatalogPage>
  );
}

export function WeekdayPage() {
  const { data: days = [] } = useDays();
  const { unit } = useUnits();
  const navigate = useNavigate();
  let weekMiles = 0;
  let weekDays = 0;
  let endMiles = 0;
  let endDays = 0;
  for (const d of days) {
    const wd = new Date(`${d.date}T00:00:00Z`).getUTCDay();
    if (wd === 0 || wd === 6) {
      endMiles += d.total_distance_miles;
      endDays += 1;
    } else {
      weekMiles += d.total_distance_miles;
      weekDays += 1;
    }
  }
  return (
    <CatalogPage title="Weekend vs weekday" description="Totals from imported day stats.">
      <p className="text-sm">
        Weekday: {formatMilesOrKm(weekMiles, unit)} across {weekDays} days
        {weekDays ? ` (${formatMilesOrKm(weekMiles / weekDays, unit)}/day)` : ''}
      </p>
      <p className="text-sm">
        Weekend: {formatMilesOrKm(endMiles, unit)} across {endDays} days
        {endDays ? ` (${formatMilesOrKm(endMiles / endDays, unit)}/day)` : ''}
      </p>
      <Button type="button" variant="outline" title="Open Day Trips" onClick={() => void navigate('/trips')}>
        Open Day Trips
      </Button>
    </CatalogPage>
  );
}
