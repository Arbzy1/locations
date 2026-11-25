import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import CatalogPage from './CatalogPage';
import MapView from '../explorer/Map';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { EjectField } from '../ui/eject-field';
import {
  useCluster,
  useClusterVisits,
  useClusters,
  useCorridorDetail,
  useHeatmap,
  useInvalidateLocationQueries,
  usePlaceLabels,
  type ClusterItem,
  type ClusterVisitRow,
} from '../../hooks/useApi';
import { corridorPath, placePath } from '../../lib/nav/paths';
import { parseCoverageRange } from '../../lib/nav/view-search-params';
import { rememberRecentPlace } from '../../lib/nav/nav-memory';
import { formatDuration, formatTime } from '../../utils/format';
import { MODE_LABELS } from '../../types';
import { Skeleton } from '../ui/skeleton';
import { EmptyState, ErrorState } from '../ui/states';
import PlaceActions from './PlaceActions';
import { useSession } from '../../lib/auth';
import { useUnits } from '../../lib/units';
import { findPlaceLabel } from '../../lib/explorer/hotspots';

/** Real places (`g:` Google id, `c:` snapped spot) can be renamed and deleted; regions cannot. */
const isRealPlaceKey = (key: string) => key.startsWith('g:') || key.startsWith('c:');

export function PlacesDirectory() {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('visits');
  const [cursor, setCursor] = useState<string | null>(null);
  const [accumulated, setAccumulated] = useState<ClusterItem[]>([]);
  const [showHidden, setShowHidden] = useState(false);
  const { data, isLoading, isFetching, isError, refetch } = useClusters(q, sort, cursor);
  const { data: labels } = usePlaceLabels();
  const invalidate = useInvalidateLocationQueries();
  const { data: session } = useSession();
  const isDemo = (session?.user as { role?: string } | undefined)?.role === 'demo';
  const [unhidingKey, setUnhidingKey] = useState<string | null>(null);

  const filterKey = `${q}|${sort}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setCursor(null);
    setAccumulated([]);
  }

  useEffect(() => {
    if (!data?.clusters) return;
    setAccumulated((prev) => {
      if (!cursor) return data.clusters;
      const seen = new Set(prev.map((c) => c.cluster));
      const next = [...prev];
      for (const c of data.clusters) {
        if (!seen.has(c.cluster)) next.push(c);
      }
      return next;
    });
  }, [data, cursor]);

  const places = accumulated.length > 0 ? accumulated : (data?.clusters ?? []);
  const hiddenPlaces = useMemo(
    () => (labels ?? []).filter((l) => l.hidden),
    [labels],
  );

  const unhidePlace = async (placeKey: string, label: string) => {
    setUnhidingKey(placeKey);
    const res = await fetch('/api/places/labels', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ placeKey, hidden: false }),
    });
    setUnhidingKey(null);
    if (!res.ok) {
      toast.error('Could not unhide this place.');
      return;
    }
    invalidate();
    toast.success(`Unhid ${label}.`);
  };

  return (
    <CatalogPage
      title="Place directory"
      description="Every place you stayed, from Google's place or the spot itself. Rename one and Day View uses your name. Hidden places are left out here and on the heatmap; Day View still lists those visits."
    >
      <div className="flex flex-wrap items-end gap-2">
        <EjectField label="Filter places" htmlFor="places-filter" className="max-w-sm min-w-0 flex-1">
          <Input
            id="places-filter"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            title="Filter places by name"
          />
        </EjectField>
        <EjectField label="Sort" htmlFor="places-sort">
          <select
            id="places-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            title="Sort places"
            className="h-11 rounded-lg border border-border bg-bg px-3 text-sm text-text"
          >
            <option value="visits">Most visits</option>
            <option value="duration">Most time</option>
            <option value="name">Name</option>
          </select>
        </EjectField>
        <Button
          type="button"
          variant={showHidden ? 'default' : 'outline'}
          aria-pressed={showHidden}
          title={showHidden ? 'Hide the hidden-places section' : 'Show hidden places so you can unhide them'}
          onClick={() => setShowHidden((v) => !v)}
        >
          {showHidden ? <EyeOff size={14} /> : <Eye size={14} />}
          Show hidden places{hiddenPlaces.length > 0 ? ` (${hiddenPlaces.length})` : ''}
        </Button>
      </div>

      {showHidden && (
        <div className="rounded-lg border border-border bg-bg p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Hidden places
          </h3>
          {hiddenPlaces.length === 0 ? (
            <p className="text-sm text-text-muted">No hidden places right now.</p>
          ) : (
            <ul className="divide-y divide-border">
              {hiddenPlaces.map((row) => (
                <li key={row.placeKey} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <Link
                    to={placePath(row.placeKey)}
                    title={`Open ${row.label || row.placeKey}`}
                    className="flex min-h-11 min-w-0 flex-1 items-center truncate text-sm text-accent hover:underline"
                  >
                    {row.label || row.placeKey}
                  </Link>
                  {!isDemo && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={unhidingKey === row.placeKey}
                      title={`Unhide ${row.label || row.placeKey}`}
                      onClick={() => void unhidePlace(row.placeKey, row.label || row.placeKey)}
                    >
                      <Eye size={14} />
                      Unhide
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {isLoading && places.length === 0 ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState title="Places did not load." onRetry={() => void refetch()} />
      ) : places.length === 0 ? (
        <EmptyState
          title={q.trim() ? `No places match "${q.trim()}".` : 'No places yet.'}
          body={q.trim() ? 'Try part of the name, or clear the filter.' : 'Places appear once your Timeline is imported.'}
        />
      ) : (
        <>
          <ul className="divide-y divide-border rounded-lg border border-border bg-bg">
            {places.map((c) => (
              <li key={c.cluster}>
                <Button
                  variant="ghost"
                  asChild
                  title={`Open ${c.label}`}
                  className="h-auto min-h-11 w-full justify-between rounded-none px-3 py-2 font-normal"
                >
                  <Link to={placePath(c.cluster)}>
                    <span className="truncate">{c.label}</span>
                    <span className="shrink-0 font-mono text-xs text-text-muted">
                      {c.visits} · {c.first} to {c.last}
                    </span>
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
          {data?.cursor && (
            <div className="flex justify-center pt-1">
              <Button
                type="button"
                variant="outline"
                disabled={isFetching}
                title="Load more places"
                onClick={() => setCursor(data.cursor)}
              >
                {isFetching ? 'Loading...' : 'Load more places'}
              </Button>
            </div>
          )}
        </>
      )}
    </CatalogPage>
  );
}

export function PlacePage() {
  const { key = '' } = useParams();
  const decoded = decodeURIComponent(key);
  const { timezone } = useUnits();
  const { data, isError } = useCluster(decoded, timezone);
  const { data: labels } = usePlaceLabels();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [visitCursor, setVisitCursor] = useState<string | null>(null);
  const [accumulatedVisits, setAccumulatedVisits] = useState<ClusterVisitRow[]>([]);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);

  const visitFilterKey = `${decoded}|${from}|${to}`;
  const [prevVisitFilterKey, setPrevVisitFilterKey] = useState(visitFilterKey);
  if (visitFilterKey !== prevVisitFilterKey) {
    setPrevVisitFilterKey(visitFilterKey);
    setVisitCursor(null);
    setAccumulatedVisits([]);
  }

  const { data: visitPage, isFetching: visitsFetching } = useClusterVisits(decoded, {
    from: from || undefined,
    to: to || undefined,
    cursor: visitCursor,
  });

  useEffect(() => {
    if (!visitPage?.visits) return;
    setAccumulatedVisits((prev) => {
      if (!visitCursor) return visitPage.visits;
      const seen = new Set(prev.map((v) => `${v.start}|${v.lat}|${v.lon}`));
      const next = [...prev];
      for (const v of visitPage.visits) {
        const k = `${v.start}|${v.lat}|${v.lon}`;
        if (!seen.has(k)) next.push(v);
      }
      return next;
    });
  }, [visitPage, visitCursor]);

  const { data: session } = useSession();
  const isDemo = (session?.user as { role?: string } | undefined)?.role === 'demo';

  useEffect(() => {
    if (data?.cluster) rememberRecentPlace(data.cluster, data.label || data.cluster);
  }, [data?.cluster, data?.label]);

  const meta = useMemo(() => {
    if (!data) return undefined;
    return findPlaceLabel(
      {
        placeKey: data.cluster,
        cluster: data.cluster,
        label: data.label,
        lat: data.lat,
        lon: data.lon,
        count: data.visits,
      },
      labels ?? [],
    );
  }, [data, labels]);

  if (isError) {
    return (
      <CatalogPage title="Place">
        <EmptyState
          title="Place not found."
          body="It may have been removed by a re-import. Open the place directory to find it again."
        />
      </CatalogPage>
    );
  }
  if (!data) {
    return (
      <CatalogPage title="Place">
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-11 w-1/2" />
        </div>
      </CatalogPage>
    );
  }

  const maxHour = data.hour_histogram.reduce((m, n) => Math.max(m, n), 1);
  const peakHour = data.hour_histogram.reduce(
    (best, n, h) => (n > (data.hour_histogram[best] ?? -1) ? h : best),
    0,
  );
  const activeHour = selectedHour ?? peakHour;
  const tzLabel = data.timezone || timezone || 'UTC';
  const visits = accumulatedVisits.length > 0 || visitCursor ? accumulatedVisits : (visitPage?.visits ?? []);

  return (
    <CatalogPage title={data.label} description={`First ${data.first} · Last ${data.last} · ${data.visits} visits`}>
      <div className="h-56 overflow-hidden rounded-lg border border-border">
        <MapView
          compact
          areaMarkers={[{ lat: data.lat, lon: data.lon, label: data.label, visits: data.visits }]}
        />
      </div>
      {!isDemo && isRealPlaceKey(data.cluster) && (
        <PlaceActions
          key={data.cluster}
          placeKey={data.cluster}
          label={data.label}
          hidden={Boolean(data.hidden)}
          favourite={Boolean(meta?.favourite)}
          color={meta?.color ?? null}
          tags={meta?.tags ?? []}
        />
      )}
      <div>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-text-muted">Time of day ({tzLabel})</h3>
          <span className="font-mono text-xs text-text-muted">
            {String(activeHour).padStart(2, '0')}:00 · {data.hour_histogram[activeHour] ?? 0} visits
          </span>
        </div>
        <div className="flex h-16 items-end gap-px">
          {data.hour_histogram.map((n, hour) => (
            <button
              key={hour}
              type="button"
              title={`${String(hour).padStart(2, '0')}:00 · ${n} visits`}
              aria-label={`${String(hour).padStart(2, '0')}:00, ${n} visits`}
              onClick={() => setSelectedHour(hour)}
              className="flex h-full min-h-11 flex-1 items-end focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            >
              <span
                className={`w-full rounded-t-xs transition-opacity ${
                  activeHour === hour ? 'bg-accent' : 'bg-accent/75 hover:bg-accent'
                }`}
                style={{ height: `${Math.max(6, (n / maxHour) * 100)}%` }}
              />
            </button>
          ))}
        </div>
      </div>
      {data.corridors.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data.corridors.map((c) => (
            <Button key={`${c.from}-${c.to}`} variant="outline" size="sm" asChild title="Open corridor">
              <Link to={corridorPath(c.from, c.to)}>
                {c.from === data.cluster ? c.to : c.from} · {c.count}
              </Link>
            </Button>
          ))}
        </div>
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <EjectField label="From date" htmlFor="place-visits-from">
            <Input
              id="place-visits-from"
              type="date"
              value={from}
              title="Filter visits starting from this date"
              onChange={(e) => setFrom(e.target.value)}
            />
          </EjectField>
          <EjectField label="To date" htmlFor="place-visits-to">
            <Input
              id="place-visits-to"
              type="date"
              value={to}
              title="Filter visits up to this date"
              onChange={(e) => setTo(e.target.value)}
            />
          </EjectField>
          {(from || to) && (
            <Button
              type="button"
              variant="outline"
              title="Clear visit date filters"
              onClick={() => {
                setFrom('');
                setTo('');
              }}
            >
              Clear dates
            </Button>
          )}
        </div>

        {visits.length === 0 ? (
          <p className="text-sm text-text-muted">
            {from || to ? 'No visits in this date range.' : 'No visits recorded yet.'}
          </p>
        ) : (
          <ul className="space-y-1">
            {visits.map((v) => (
              <li key={`${v.start}-${v.lat}`}>
                <Button
                  variant="ghost"
                  asChild
                  title={`Open ${v.date}`}
                  className="h-11 w-full justify-between font-normal"
                >
                  <Link to={`/day/${v.date}`}>
                    <span>
                      {v.date} · {formatTime(v.start, timezone)}
                    </span>
                    <span className="text-xs text-text-muted">{formatDuration(v.duration_minutes)}</span>
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        )}

        {visitPage?.cursor && (
          <div className="flex justify-center pt-1">
            <Button
              type="button"
              variant="outline"
              disabled={visitsFetching}
              title="Load older visits at this place"
              onClick={() => setVisitCursor(visitPage.cursor)}
            >
              {visitsFetching ? 'Loading...' : 'Load more visits'}
            </Button>
          </div>
        )}
      </div>
    </CatalogPage>
  );
}

export function CorridorPage() {
  const { a = '', b = '' } = useParams();
  const from = decodeURIComponent(a);
  const to = decodeURIComponent(b);
  const { data, isError } = useCorridorDetail(from, to);
  if (isError || !data) {
    return (
      <CatalogPage title="Corridor">
        <p className="text-sm text-text-muted">{isError ? 'No transitions between these places.' : 'Loading...'}</p>
      </CatalogPage>
    );
  }
  const line =
    data.from_lat != null && data.to_lat != null
      ? [
          {
            from: [data.from_lat, data.from_lon ?? 0] as [number, number],
            to: [data.to_lat, data.to_lon ?? 0] as [number, number],
            count: data.count,
          },
        ]
      : [];
  return (
    <CatalogPage title={`${data.from} to ${data.to}`} description={`${data.count} transitions`}>
      {line.length > 0 && (
        <div className="h-56 overflow-hidden rounded-lg border border-border">
          <MapView compact corridorLines={line} />
        </div>
      )}
      <ul className="space-y-1">
        {data.transitions.map((t, i) => (
          <li key={`${t.date}-${i}`}>
            <Button variant="ghost" asChild title={`Open ${t.date}`} className="h-11 w-full justify-between font-normal">
              <Link to={`/day/${t.date}`}>
                <span>
                  {t.date} · {t.from} to {t.to}
                </span>
                <span className="text-xs text-text-muted">{MODE_LABELS[t.mode] || t.mode}</span>
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </CatalogPage>
  );
}

export function CoveragePage() {
  const [params] = useSearchParams();
  const range = parseCoverageRange(params);
  const { data } = useHeatmap({ from: range.from, to: range.to });
  return (
    <CatalogPage
      title="Coverage map"
      description={
        range.from || range.to
          ? `Imported history${range.from ? ` from ${range.from}` : ''}${range.to ? ` to ${range.to}` : ''}. Not a live map.`
          : 'Imported history only. This is not a live location map.'
      }
    >
      <div className="h-[min(70vh,32rem)] overflow-hidden rounded-lg border border-border">
        <MapView compact heatmapPoints={data || []} />
      </div>
    </CatalogPage>
  );
}

export function AreaPage() {
  const { settlement = '' } = useParams();
  const name = decodeURIComponent(settlement);
  const { data } = useHeatmap();
  const points = (data || []).filter(
    (p) => (p.settlement || p.label || p.cluster) === name,
  );
  return (
    <CatalogPage title={name} description="Places grouped by settlement guess from the heatmap.">
      <div className="h-56 overflow-hidden rounded-lg border border-border">
        <MapView
          compact
          heatmapPoints={points}
          areaMarkers={points.slice(0, 20).map((p) => ({
            lat: p.lat,
            lon: p.lon,
            label: p.label || p.cluster || name,
            visits: p.count,
          }))}
        />
      </div>
      <ul className="space-y-1">
        {points.slice(0, 30).map((p) => {
          const targetKey = p.placeKey || p.cluster || p.label || name;
          const display = p.label || p.cluster || name;
          return (
            <li key={`${p.lat}-${p.lon}`}>
              <Button variant="ghost" asChild title={`Open ${display}`} className="h-11 w-full justify-start font-normal">
                <Link to={placePath(targetKey)}>{display}</Link>
              </Button>
            </li>
          );
        })}
      </ul>
    </CatalogPage>
  );
}

export function AreasIndex() {
  const navigate = useNavigate();
  const { data } = useHeatmap();
  const groups = new Map<string, number>();
  for (const p of data || []) {
    const name = p.settlement || 'Ungrouped';
    groups.set(name, (groups.get(name) ?? 0) + p.count);
  }
  const rows = [...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
  return (
    <CatalogPage title="Areas" description="Settlements guessed from coordinates, not confirmed addresses.">
      <ul className="space-y-1">
        {rows.map(([name, count]) => (
          <li key={name}>
            <Button
              variant="ghost"
              title={`Open ${name}`}
              className="h-11 w-full justify-between font-normal"
              onClick={() => void navigate(`/areas/${encodeURIComponent(name)}`)}
            >
              <span>{name}</span>
              <span className="font-mono text-xs text-text-muted">{count}</span>
            </Button>
          </li>
        ))}
      </ul>
    </CatalogPage>
  );
}
