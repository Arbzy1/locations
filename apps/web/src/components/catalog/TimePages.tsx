import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMemo } from 'react';
import { addMonths, addWeeks, format, parseISO, startOfWeek } from 'date-fns';
import CatalogPage from './CatalogPage';
import DayCalendar from '../explorer/DayCalendar';
import MapView from '../explorer/Map';
import { Button } from '../ui/button';
import { useDays, useHeatmap } from '../../hooks/useApi';
import { formatMilesOrKm } from '../../utils/format';
import { useUnits } from '../../lib/units';

export function MonthPage() {
  const { ym = '' } = useParams();
  const navigate = useNavigate();
  const { data: days = [] } = useDays();
  const month = /^\d{4}-\d{2}$/.test(ym) ? ym : format(new Date(), 'yyyy-MM');
  const from = `${month}-01`;
  const { data: heatmap } = useHeatmap({ from, to: format(addMonths(parseISO(from), 1), 'yyyy-MM-dd') });
  const selected = days.find((d) => d.date.startsWith(month))?.date || from;
  return (
    <CatalogPage title={month} description="Calendar plus heatmap for this month.">
      <div className="flex gap-2">
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
  const { unit } = useUnits();
  const seed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? parseISO(date) : new Date();
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
  const [params] = useSearchParams();
  const { data: days = [] } = useDays();
  const md = params.get('d') || format(new Date(), 'MM-dd');
  const matches = days.filter((d) => d.date.slice(5) === md);
  return (
    <CatalogPage title={`On this day · ${md}`} description="Same calendar date across years in your import.">
      <ul className="space-y-1">
        {matches.map((d) => (
          <li key={d.date}>
            <Button variant="ghost" asChild title={`Open ${d.date}`} className="h-11 w-full justify-between font-normal">
              <Link to={`/day/${d.date}`}>
                <span>{d.date}</span>
                <span className="font-mono text-xs text-text-muted">{d.visit_count} visits</span>
              </Link>
            </Button>
          </li>
        ))}
        {matches.length === 0 && <p className="text-sm text-text-muted">No imported days for this date.</p>}
      </ul>
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
