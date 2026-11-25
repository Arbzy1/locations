import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMemo } from 'react';
import { addMonths, addWeeks, endOfMonth, format, parseISO, startOfWeek } from 'date-fns';
import CatalogPage from './CatalogPage';
import DayCalendar from '../explorer/DayCalendar';
import MapView from '../explorer/Map';
import { Button } from '../ui/button';
import { EjectField } from '../ui/eject-field';
import { EmptyState } from '../ui/states';
import { Skeleton } from '../ui/skeleton';
import { useDays, useHeatmap, useOnThisDay } from '../../hooks/useApi';
import { formatMilesOrKm } from '../../utils/format';
import { useUnits } from '../../lib/units';
import { localTodayIso } from '../../lib/explorer/year-review';
import { placePath } from '../../lib/nav/paths';
import { MODE_COLORS, MODE_LABELS } from '../../types';

const MONTHS = [
  { value: '01', label: 'January', maxDay: 31 },
  { value: '02', label: 'February', maxDay: 29 },
  { value: '03', label: 'March', maxDay: 31 },
  { value: '04', label: 'April', maxDay: 30 },
  { value: '05', label: 'May', maxDay: 31 },
  { value: '06', label: 'June', maxDay: 30 },
  { value: '07', label: 'July', maxDay: 31 },
  { value: '08', label: 'August', maxDay: 31 },
  { value: '09', label: 'September', maxDay: 30 },
  { value: '10', label: 'October', maxDay: 31 },
  { value: '11', label: 'November', maxDay: 30 },
  { value: '12', label: 'December', maxDay: 31 },
] as const;

export function MonthPage() {
  const { ym = '' } = useParams();
  const navigate = useNavigate();
  const { data: days = [] } = useDays();
  const { timezone } = useUnits();
  const fallbackYm = localTodayIso(timezone).slice(0, 7);
  const month = /^\d{4}-\d{2}$/.test(ym) ? ym : fallbackYm;
  const from = `${month}-01`;
  const to = format(endOfMonth(parseISO(from)), 'yyyy-MM-dd');
  const { data: heatmap } = useHeatmap({ from, to });
  const selected = days.find((d) => d.date.startsWith(month))?.date || from;
  return (
    <CatalogPage title={month} description="Calendar plus heatmap for this month.">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          title="Previous month"
          onClick={() => void navigate(`/month/${format(addMonths(parseISO(from), -1), 'yyyy-MM')}`)}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          title="Next month"
          onClick={() => void navigate(`/month/${format(addMonths(parseISO(from), 1), 'yyyy-MM')}`)}
        >
          Next
        </Button>
        <Button
          title="Show every journey line this month"
          onClick={() => void navigate(`/routes?period=month&ym=${month}`)}
        >
          Show all routes
        </Button>
      </div>
      <DayCalendar days={days} selectedDate={selected} onSelectDate={(d) => void navigate(`/day/${d}`)} />
      <div className="h-64 overflow-hidden rounded-lg border border-border">
        <MapView compact heatmapPoints={heatmap || []} />
      </div>
    </CatalogPage>
  );
}

export function WeekPage() {
  const { date = '' } = useParams();
  const navigate = useNavigate();
  const { data: days = [] } = useDays();
  const { unit, timezone } = useUnits();
  const todayIso = localTodayIso(timezone);
  const seed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? parseISO(date) : parseISO(todayIso);
  const start = startOfWeek(seed, { weekStartsOn: 1 });
  const strip = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return format(d, 'yyyy-MM-dd');
  });
  const weekDays = strip.map((d) => days.find((x) => x.date === d) ?? null);
  return (
    <CatalogPage title={`Week of ${strip[0]}`} description="Seven-day strip. Tap a day to open Day View.">
      <div className="flex gap-2">
        <Button variant="outline" title="Previous week" onClick={() => void navigate(`/week/${format(addWeeks(start, -1), 'yyyy-MM-dd')}`)}>
          Previous
        </Button>
        <Button variant="outline" title="Next week" onClick={() => void navigate(`/week/${format(addWeeks(start, 1), 'yyyy-MM-dd')}`)}>
          Next
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {strip.map((d, i) => {
          const row = weekDays[i];
          return (
            <Button
              key={d}
              variant="outline"
              title={`Open ${d}`}
              className="h-auto min-h-11 justify-between"
              onClick={() => void navigate(`/day/${d}`)}
            >
              <span>{d}</span>
              <span className="text-xs text-text-muted">
                {row ? formatMilesOrKm(row.total_distance_miles, unit) : 'No data'}
              </span>
            </Button>
          );
        })}
      </div>
    </CatalogPage>
  );
}

export function OnThisDayPage() {
  const [params, setParams] = useSearchParams();
  const { unit, timezone } = useUnits();
  const todayIso = localTodayIso(timezone);
  const currentYear = Number(todayIso.slice(0, 4));
  const rawMd = params.get('d');
  const md = rawMd && /^\d{2}-\d{2}$/.test(rawMd) ? rawMd : todayIso.slice(5);
  const [selMonth, selDay] = md.split('-');
  const monthSpec = MONTHS.find((m) => m.value === selMonth) ?? MONTHS[0];
  const clampedDay = String(Math.min(Number(selDay) || 1, monthSpec.maxDay)).padStart(2, '0');
  const normalizedMd = `${monthSpec.value}-${clampedDay}`;

  // Pass next year's anchor when browsing arbitrary calendar dates so currentYear's own day is also included if imported,
  // while keeping accurate years_ago relative to currentYear.
  const anchorYear = normalizedMd === todayIso.slice(5) ? currentYear : currentYear + 1;
  const queryDate =
    normalizedMd === '02-29'
      ? `2028-02-29`
      : `${anchorYear}-${normalizedMd}`;
  const { data, isLoading } = useOnThisDay(queryDate);
  const years = data?.years ?? [];

  const setMonthDay = (nextMonth: string, nextDay: string) => {
    const spec = MONTHS.find((m) => m.value === nextMonth) ?? MONTHS[0];
    const dayStr = String(Math.min(Math.max(1, Number(nextDay) || 1), spec.maxDay)).padStart(2, '0');
    setParams({ d: `${spec.value}-${dayStr}` }, { replace: true });
  };

  return (
    <CatalogPage
      title={`On this day · ${monthSpec.label} ${Number(clampedDay)}`}
      description="Same calendar date across earlier years in your imported history."
    >
      <div className="flex flex-wrap items-end gap-2">
        <EjectField label="Month" htmlFor="otd-month">
          <select
            id="otd-month"
            value={monthSpec.value}
            title="Choose month"
            onChange={(e) => setMonthDay(e.target.value, clampedDay)}
            className="h-11 rounded-lg border border-border bg-bg px-3 text-sm text-text"
          >
            {MONTHS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </EjectField>
        <EjectField label="Day" htmlFor="otd-day">
          <select
            id="otd-day"
            value={clampedDay}
            title="Choose day of month"
            onChange={(e) => setMonthDay(monthSpec.value, e.target.value)}
            className="h-11 rounded-lg border border-border bg-bg px-3 text-sm text-text"
          >
            {Array.from({ length: monthSpec.maxDay }, (_, i) => {
              const d = String(i + 1).padStart(2, '0');
              return (
                <option key={d} value={d}>
                  {i + 1}
                </option>
              );
            })}
          </select>
        </EjectField>
        {normalizedMd !== todayIso.slice(5) && (
          <Button
            type="button"
            variant="outline"
            title="Jump back to today's calendar date"
            onClick={() => setParams({}, { replace: true })}
          >
            Today
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : years.length === 0 ? (
        <EmptyState
          title="No imported days for this date."
          body="Try picking another month and day above."
        />
      ) : (
        <ul className="space-y-2">
          {years.map((y) => {
            const yearsDiff = currentYear - Number(y.date.slice(0, 4));
            const relLabel =
              yearsDiff <= 0
                ? 'This year'
                : `${yearsDiff} year${yearsDiff === 1 ? '' : 's'} ago`;
            return (
              <li key={y.date} className="rounded-lg border border-border bg-bg p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link
                    to={`/day/${y.date}`}
                    title={`Open ${y.date} in Day View`}
                    className="inline-flex min-h-11 items-center font-semibold text-accent hover:underline"
                  >
                    {y.date}
                    <span className="ml-2 text-xs font-normal text-text-muted">{relLabel}</span>
                  </Link>
                  <span className="font-mono text-xs text-text-muted">
                    {formatMilesOrKm(y.miles, unit)} · {y.visits} visits · {y.journeys} journeys
                  </span>
                </div>
                {y.places.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {y.places.map((p) => (
                      <Button
                        key={p.key}
                        variant="outline"
                        size="sm"
                        asChild
                        title={`Open ${p.label}`}
                      >
                        <Link to={placePath(p.key)}>{p.label}</Link>
                      </Button>
                    ))}
                  </div>
                )}
                {Object.keys(y.modes ?? {}).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {Object.entries(y.modes)
                      .sort((a, b) => b[1] - a[1])
                      .map(([mode, count]) => (
                        <span
                          key={mode}
                          className="rounded-full border px-2 py-0.5 text-[11px]"
                          style={{
                            color: MODE_COLORS[mode] || 'var(--text-muted)',
                            borderColor: MODE_COLORS[mode] || 'var(--border)',
                          }}
                        >
                          {MODE_LABELS[mode] || mode} · {count}
                        </span>
                      ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </CatalogPage>
  );
}

export function GapsPage() {
  const { data: days = [] } = useDays();
  const ranges = useMemo(() => {
    if (days.length < 2) return [] as { start: string; end: string; days: number }[];
    const dates = days.map((d) => d.date).sort();
    const out: { start: string; end: string; days: number }[] = [];
    for (let i = 1; i < dates.length; i++) {
      const prev = parseISO(dates[i - 1]);
      const cur = parseISO(dates[i]);
      const diff = Math.round((cur.getTime() - prev.getTime()) / 86400000);
      if (diff > 1) {
        const start = format(new Date(prev.getTime() + 86400000), 'yyyy-MM-dd');
        const end = format(new Date(cur.getTime() - 86400000), 'yyyy-MM-dd');
        out.push({ start, end, days: diff - 1 });
      }
    }
    return out;
  }, [days]);
  return (
    <CatalogPage
      title="Gaps"
      description="Missing days in the imported Takeout file. This is not live tracking, and a gap does not mean the phone was off."
    >
      <ul className="space-y-2 text-sm">
        {ranges.map((r) => (
          <li key={`${r.start}-${r.end}`} className="rounded-lg border border-border bg-bg px-3 py-2">
            {r.start} to {r.end} · {r.days} day{r.days === 1 ? '' : 's'}
          </li>
        ))}
        {ranges.length === 0 && <p className="text-text-muted">No gaps between the first and last imported day.</p>}
      </ul>
    </CatalogPage>
  );
}
