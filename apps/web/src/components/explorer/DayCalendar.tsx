import { useEffect, useMemo, useState } from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MODE_COLORS, MODE_LABELS } from '../../types';
import type { DaySummary } from '../../types';
import { Button } from '../ui/button';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

interface Props {
  days: DaySummary[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

function p90(values: number[]): number {
  if (values.length === 0) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9));
  return Math.max(sorted[idx], 0.1);
}

function topModes(modes: Record<string, number>, limit = 3): string[] {
  return Object.entries(modes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([mode]) => mode);
}

export default function DayCalendar({ days, selectedDate, onSelectDate }: Props) {
  const byDate = useMemo(() => {
    const map = new Map<string, DaySummary>();
    for (const d of days) map.set(d.date, d);
    return map;
  }, [days]);

  const intensityCap = useMemo(
    () => p90(days.map((d) => d.total_distance_miles)),
    [days],
  );

  const dataRange = useMemo(() => {
    if (!days.length) return null;
    return {
      min: parseISO(days[0].date),
      max: parseISO(days[days.length - 1].date),
    };
  }, [days]);

  const [viewMonth, setViewMonth] = useState(() => {
    const seed = selectedDate || days[days.length - 1]?.date;
    return seed ? startOfMonth(parseISO(seed)) : startOfMonth(new Date());
  });

  useEffect(() => {
    if (!selectedDate) return;
    const sel = parseISO(selectedDate);
    if (!isSameMonth(sel, viewMonth)) {
      setViewMonth(startOfMonth(sel));
    }
  }, [selectedDate]);

  const gridDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [viewMonth]);

  const monthModes = useMemo(() => {
    const set = new Set<string>();
    for (const day of gridDays) {
      if (!isSameMonth(day, viewMonth)) continue;
      const key = format(day, 'yyyy-MM-dd');
      const summary = byDate.get(key);
      if (!summary) continue;
      for (const mode of Object.keys(summary.modes)) set.add(mode);
    }
    return [...set].sort();
  }, [gridDays, viewMonth, byDate]);

  const canPrevMonth = dataRange
    ? subMonths(viewMonth, 1) >= startOfMonth(dataRange.min)
    : false;
  const canNextMonth = dataRange
    ? addMonths(viewMonth, 1) <= startOfMonth(dataRange.max)
    : false;

  const todayKey = format(new Date(), 'yyyy-MM-dd');

  /** Months with data, for the year/month jump menus. */
  const monthsWithData = useMemo(() => new Set(days.map((d) => d.date.slice(0, 7))), [days]);
  const years = useMemo(() => [...new Set(days.map((d) => d.date.slice(0, 4)))], [days]);
  const viewYear = format(viewMonth, 'yyyy');
  const jumpTo = (year: string, month: number) => {
    // Land on a month that has data when the exact one is empty.
    let target = `${year}-${String(month).padStart(2, '0')}`;
    if (!monthsWithData.has(target)) {
      const inYear = [...monthsWithData].filter((m) => m.startsWith(year)).sort();
      target = inYear.find((m) => m >= target) ?? inYear[inYear.length - 1] ?? target;
    }
    setViewMonth(startOfMonth(parseISO(`${target}-01`)));
  };
  const selectClass =
    'h-9 min-w-0 flex-1 rounded border border-border bg-bg px-2 text-sm text-text transition-colors duration-ui-fast ease-ui hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40';

  return (
    <div className="mt-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => canPrevMonth && setViewMonth((m) => subMonths(m, 1))}
          disabled={!canPrevMonth}
          className="flex h-11 w-11 items-center justify-center rounded border border-border transition-colors duration-ui-fast ease-ui hover:bg-bg disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Previous month"
          title="Show previous month"
        >
          <ChevronLeft size={16} />
        </button>
        <Button variant="ghost" asChild title="Open month page" className="h-11 px-3 text-sm font-medium text-text">
          <Link to={`/month/${format(viewMonth, 'yyyy-MM')}`}>{format(viewMonth, 'MMMM yyyy')}</Link>
        </Button>
        <button
          type="button"
          onClick={() => canNextMonth && setViewMonth((m) => addMonths(m, 1))}
          disabled={!canNextMonth}
          className="flex h-11 w-11 items-center justify-center rounded border border-border transition-colors duration-ui-fast ease-ui hover:bg-bg disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Next month"
          title="Show next month"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {years.length > 0 && (
        <div className="mb-2 flex gap-2">
          <select
            className={selectClass}
            value={viewYear}
            title="Jump to a year"
            aria-label="Jump to a year"
            onChange={(e) => jumpTo(e.target.value, viewMonth.getMonth() + 1)}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <select
            className={selectClass}
            value={viewMonth.getMonth() + 1}
            title="Jump to a month"
            aria-label="Jump to a month"
            onChange={(e) => setViewMonth(startOfMonth(parseISO(`${viewYear}-${e.target.value.padStart(2, '0')}-01`)))}
          >
            {Array.from({ length: 12 }, (_, i) => {
              const key = `${viewYear}-${String(i + 1).padStart(2, '0')}`;
              return (
                <option key={key} value={i + 1}>
                  {format(parseISO(`${key}-01`), 'MMMM')}
                  {monthsWithData.has(key) ? '' : ' (no data)'}
                </option>
              );
            })}
          </select>
        </div>
      )}

      <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[11px] text-text-muted">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-0.5">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {gridDays.map((day) => {
          const key = format(day, 'yyyy-MM-dd');
          const inMonth = isSameMonth(day, viewMonth);
          const summary = byDate.get(key);
          const hasData = !!summary;
          const selected = selectedDate === key;
          const isToday = key === todayKey;
          const intensity = summary
            ? Math.min(1, summary.total_distance_miles / intensityCap)
            : 0;
          const modes = summary ? topModes(summary.modes) : [];

          return (
            <button
              key={key}
              type="button"
              disabled={!hasData}
              onClick={() => hasData && onSelectDate(key)}
              title={
                summary
                  ? `${key} · ${summary.total_distance_miles.toFixed(1)} mi · ${summary.visit_count} visits · ${summary.activity_count} journeys`
                  : key
              }
              className={[
                'relative flex aspect-square flex-col items-center justify-center rounded-md text-xs transition duration-ui-fast ease-ui',
                inMonth ? '' : 'opacity-35',
                hasData
                  ? 'cursor-pointer hover:brightness-125'
                  : 'cursor-default text-text-muted/50',
                selected ? 'ring-2 ring-accent ring-offset-1 ring-offset-surface' : '',
              ].join(' ')}
              style={
                hasData
                  ? {
                      backgroundColor: `color-mix(in srgb, var(--color-accent) ${Math.round(12 + intensity * 55)}%, transparent)`,
                    }
                  : undefined
              }
            >
              <span
                className={[
                  'leading-none',
                  selected ? 'font-semibold text-accent' : hasData ? 'text-text' : '',
                  isToday && !selected ? 'underline decoration-accent/70 underline-offset-2' : '',
                ].join(' ')}
              >
                {format(day, 'd')}
              </span>
              {modes.length > 0 && (
                <span className="mt-0.5 flex h-1.5 items-center gap-0.5">
                  {modes.map((mode) => (
                    <span
                      key={mode}
                      className="h-1 w-1 rounded-full"
                      style={{ backgroundColor: MODE_COLORS[mode] || 'var(--text-muted)' }}
                    />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-2 space-y-1.5 text-[11px] text-text-muted">
        <div className="flex items-center gap-2">
          <span>Distance</span>
          <div className="flex h-2 flex-1 overflow-hidden rounded-full">
            <div
              className="h-full flex-1"
              style={{
                background:
                  'linear-gradient(to right, color-mix(in srgb, var(--color-accent) 12%, transparent), color-mix(in srgb, var(--color-accent) 67%, transparent))',
              }}
            />
          </div>
          <span>busy</span>
        </div>
        {monthModes.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {monthModes.map((mode) => (
              <span key={mode} className="inline-flex items-center gap-1">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: MODE_COLORS[mode] || 'var(--text-muted)' }}
                />
                {MODE_LABELS[mode] || mode}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
