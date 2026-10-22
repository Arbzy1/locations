import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarRange } from 'lucide-react';
import { Card, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { ErrorState } from '../ui/states';
import { useRangeInsights } from '../../hooks/useApi';
import { useUnits } from '../../lib/units';
import { formatDuration, formatMilesOrKm } from '../../utils/format';
import { placePath } from '../../lib/nav/paths';
import { MODE_LABELS } from '../../types';

type Preset = 'year' | 'last-year' | '12m' | '90d' | 'custom';

const iso = (d: Date) => d.toISOString().slice(0, 10);

function presetRange(preset: Preset, today = new Date()): { from: string; to: string } {
  const y = today.getUTCFullYear();
  if (preset === 'year') return { from: `${y}-01-01`, to: iso(today) };
  if (preset === 'last-year') return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
  const days = preset === '90d' ? 90 : 365;
  return { from: iso(new Date(today.getTime() - (days - 1) * 86_400_000)), to: iso(today) };
}

const PRESETS: { id: Preset; label: string; title: string }[] = [
  { id: 'year', label: 'This year', title: 'From 1 January to today' },
  { id: 'last-year', label: 'Last year', title: 'The whole of last year' },
  { id: '12m', label: '12 months', title: 'The last 12 months' },
  { id: '90d', label: '90 days', title: 'The last 90 days' },
  { id: 'custom', label: 'Custom', title: 'Pick your own dates' },
];

/** "+12%" style change against the same dates last year, or nothing when there is no base. */
function change(now: number, before: number) {
  if (!before) return null;
  const pct = Math.round(((now - before) / before) * 100);
  return { pct, label: `${pct > 0 ? '+' : ''}${pct}%` };
}

function Stat({ label, value, now, before }: { label: string; value: string; now: number; before: number }) {
  const delta = change(now, before);
  return (
    <div className="rounded-lg border border-border bg-bg p-3">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="mt-1 text-lg font-semibold text-text">{value}</div>
      <div className="text-xs text-text-muted" title="Compared with the same dates last year">
        {delta ? (
          <span className={delta.pct >= 0 ? 'text-walk' : 'text-train'}>{delta.label}</span>
        ) : (
          'No data a year earlier'
        )}
        {delta && ' vs last year'}
      </div>
    </div>
  );
}

/** Insights for any period, compared with the same dates a year earlier. */
export default function RangeInsightsCard() {
  const { unit } = useUnits();
  const [preset, setPreset] = useState<Preset>('year');
  const [custom, setCustom] = useState(() => presetRange('12m'));
  const range = useMemo(() => (preset === 'custom' ? custom : presetRange(preset)), [preset, custom]);
  const { data, isLoading, isError, refetch } = useRangeInsights(range);

  return (
    <Card>
      <CardTitle className="flex items-center gap-2 text-base">
        <CalendarRange size={18} className="text-accent" />
        Any period
      </CardTitle>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Period">
        {PRESETS.map((p) => (
          <Button
            key={p.id}
            type="button"
            size="sm"
            variant={preset === p.id ? 'default' : 'outline'}
            aria-pressed={preset === p.id}
            title={p.title}
            onClick={() => setPreset(p.id)}
          >
            {p.label}
          </Button>
        ))}
      </div>
      {preset === 'custom' && (
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="date"
            title="First day of the period"
            aria-label="From"
            value={custom.from}
            onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
            className="h-11 rounded-lg border border-border bg-bg px-2 text-sm text-text"
          />
          <input
            type="date"
            title="Last day of the period"
            aria-label="To"
            value={custom.to}
            onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
            className="h-11 rounded-lg border border-border bg-bg px-2 text-sm text-text"
          />
        </div>
      )}

      {isLoading ? (
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4" aria-busy="true">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : isError || !data ? (
        <ErrorState title="This period did not load." onRetry={() => void refetch()} />
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat
              label="Distance"
              value={formatMilesOrKm(data.current.miles, unit)}
              now={data.current.miles}
              before={data.last_year.miles}
            />
            <Stat
              label="Days recorded"
              value={data.current.days_with_data.toLocaleString()}
              now={data.current.days_with_data}
              before={data.last_year.days_with_data}
            />
            <Stat
              label="Journeys"
              value={data.current.journeys.toLocaleString()}
              now={data.current.journeys}
              before={data.last_year.journeys}
            />
            <Stat
              label="Places"
              value={data.current.places.toLocaleString()}
              now={data.current.places}
              before={data.last_year.places}
            />
          </div>

          {Object.keys(data.current.modes).length > 0 && (
            <p className="mt-3 text-sm text-text-muted">
              {Object.entries(data.current.modes)
                .sort((a, b) => b[1].miles - a[1].miles)
                .slice(0, 4)
                .map(([mode, m]) => `${MODE_LABELS[mode] ?? mode} ${formatMilesOrKm(m.miles, unit)}`)
                .join(' · ')}
            </p>
          )}

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-text">Where you spent the most time</h3>
              {data.top_places.length ? (
                <ol className="space-y-1 text-sm">
                  {data.top_places.map((p) => (
                    <li key={p.key} className="flex justify-between gap-2">
                      <Link to={placePath(p.key)} title={`Open ${p.label}`} className="min-h-11 truncate text-accent hover:underline">
                        {p.label}
                      </Link>
                      <span className="shrink-0 text-text-muted">{formatDuration(p.minutes)}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-text-muted">No stays in this period.</p>
              )}
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-text">
                New places ({data.new_places.count.toLocaleString()})
              </h3>
              {data.new_places.sample.length ? (
                <ul className="space-y-1 text-sm">
                  {data.new_places.sample.map((p) => (
                    <li key={p.key}>
                      <Link to={placePath(p.key)} title={`Open ${p.label}`} className="min-h-11 truncate text-accent hover:underline">
                        {p.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-text-muted">Nowhere new this time.</p>
              )}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
