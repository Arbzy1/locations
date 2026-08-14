import { Link, useNavigate, useParams } from 'react-router-dom';
import { useState } from 'react';
import CatalogPage from './CatalogPage';
import MapView from '../Map';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  useCluster,
  useClusterVisits,
  useClusters,
  useCorridorDetail,
  useHeatmap,
} from '../../hooks/useApi';
import { corridorPath, placePath } from '../../lib/paths';
import { formatDuration, formatTime } from '../../utils/format';
import { MODE_LABELS } from '../../types';

export function PlacesDirectory() {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('visits');
  const { data } = useClusters(q, sort);
  return (
    <CatalogPage title="Place directory" description="Every named cluster in your imported Timeline. Hidden places are omitted here; Day View still lists those visits.">
      <div className="flex flex-wrap gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          title="Filter places by name"
          placeholder="Filter places"
          className="max-w-sm"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          title="Sort places"
          className="h-11 rounded-lg border border-border bg-bg px-3 text-sm text-text"
        >
          <option value="visits">Most visits</option>
          <option value="duration">Most time</option>
          <option value="name">Name</option>
        </select>
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border bg-bg">
        {(data?.clusters ?? []).map((c) => (
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
    </CatalogPage>
  );
}

export function PlacePage() {
  const { key = '' } = useParams();
  const decoded = decodeURIComponent(key);
  const { data, isError } = useCluster(decoded);
  const { data: visitPage } = useClusterVisits(decoded);
  if (isError) {
    return (
      <CatalogPage title="Place">
        <p className="text-sm text-text-muted">This place was not found for your account.</p>
      </CatalogPage>
    );
  }
  if (!data) {
    return (
      <CatalogPage title="Place">
        <p className="text-sm text-text-muted">Loading…</p>
      </CatalogPage>
    );
  }
  const maxHour = Math.max(1, ...data.hour_histogram);
  return (
    <CatalogPage title={data.label} description={`First ${data.first} · Last ${data.last} · ${data.visits} visits`}>
      <div className="h-56 overflow-hidden rounded-lg border border-border">
        <MapView
          compact
          areaMarkers={[{ lat: data.lat, lon: data.lon, label: data.label, visits: data.visits }]}
        />
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-text-muted">Time of day (UTC)</h3>
        <div className="flex h-16 items-end gap-px">
          {data.hour_histogram.map((n, hour) => (
            <div
              key={hour}
              title={`${hour}:00 · ${n} visits`}
              className="flex-1 bg-accent/80"
              style={{ height: `${Math.max(4, (n / maxHour) * 100)}%` }}
            />
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
      <ul className="space-y-1">
        {(visitPage?.visits ?? []).map((v) => (
          <li key={`${v.start}-${v.lat}`}>
            <Button
              variant="ghost"
              asChild
              title={`Open ${v.date}`}
              className="h-11 w-full justify-between font-normal"
            >
              <Link to={`/day/${v.date}`}>
                <span>
                  {v.date} · {formatTime(v.start)}
                </span>
                <span className="text-xs text-text-muted">{formatDuration(v.duration_minutes)}</span>
              </Link>
            </Button>
          </li>
        ))}
      </ul>
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
        <p className="text-sm text-text-muted">{isError ? 'No transitions between these places.' : 'Loading…'}</p>
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
  const { data } = useHeatmap();
  return (
    <CatalogPage
      title="Coverage map"
      description="Imported history only. This is not a live location map."
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
        {points.slice(0, 30).map((p) => (
          <li key={`${p.lat}-${p.lon}`}>
            <Button variant="ghost" asChild title="Open place" className="h-11 w-full justify-start font-normal">
              <Link to={placePath(p.cluster || p.label || name)}>{p.label || p.cluster}</Link>
            </Button>
          </li>
        ))}
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
