import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { addDays, addMonths, endOfMonth, format, parseISO } from 'date-fns';
import { ChevronLeft, ChevronRight, Loader2, Route as RouteIcon } from 'lucide-react';
import MapView from './Map';
import DayCalendar from './DayCalendar';
import MobilePanel, { MobilePanelOpenButton, type MobilePanelHeight } from '../shell/MobilePanel';
import { Button } from '../ui/button';
import { useDays, useRouteLines, useSources } from '../../hooks/useApi';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useUnits } from '../../lib/units';
import { isTypingTarget } from '../../lib/nav/command-query';
import { formatMilesOrKm } from '../../utils/format';
import { MODE_COLORS, MODE_LABELS, type DaySummary, type MapFocusTarget } from '../../types';
import { cn } from '../../lib/utils';

type Period = 'day' | 'month' | 'year' | 'range';

const PERIODS: { id: Period; label: string; title: string }[] = [
  { id: 'day', label: 'Day', title: 'Show one day' },
  { id: 'month', label: 'Month', title: 'Show a whole month' },
  { id: 'year', label: 'Year', title: 'Show a whole year' },
  { id: 'range', label: 'Range', title: 'Pick a custom date range' },
];

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const NO_DAYS: DaySummary[] = [];

/** Date window [from, to] (inclusive) for the URL state. */
function windowFor(period: Period, sp: URLSearchParams, fallback: string) {
  const ym = sp.get('ym') ?? fallback.slice(0, 7);
  if (period === 'day') {
    const d = sp.get('d') ?? fallback;
    return { from: d, to: d };
  }
  if (period === 'year') {
    const y = sp.get('y') ?? fallback.slice(0, 4);
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
  if (period === 'range') {
    const from = sp.get('from') ?? `${ym}-01`;
    const to = sp.get('to') ?? format(endOfMonth(parseISO(from)), 'yyyy-MM-dd');
    return { from: ISO_DAY.test(from) ? from : `${ym}-01`, to: ISO_DAY.test(to) ? to : from };
  }
  const start = parseISO(`${ym}-01`);
  return { from: format(start, 'yyyy-MM-dd'), to: format(endOfMonth(start), 'yyyy-MM-dd') };
}

export default function RoutesView() {
  const [sp, setSp] = useSearchParams();
  const { data: dayData } = useDays();
  const days = dayData ?? NO_DAYS;
  const { data: sources } = useSources();
  const { unit } = useUnits();
  const { isDesktop } = useBreakpoint();
  const [hiddenModes, setHiddenModes] = useState<string[]>([]);
  const [sourceFilter, setSourceFilter] = useState<string[]>([]);
  const [panelOpen, setPanelOpen] = useState(true);
  const [sheetHeight, setSheetHeight] = useState<MobilePanelHeight>('half');
  const [sizeSignal, setSizeSignal] = useState(0);
  const [focusTarget, setFocusTarget] = useState<MapFocusTarget | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  const latest = days[days.length - 1]?.date ?? format(new Date(), 'yyyy-MM-dd');
  const period: Period = (['day', 'month', 'year', 'range'] as const).find((p) => p === sp.get('period')) ?? 'month';
  const { from, to } = windowFor(period, sp, latest);
  const { data, isFetching, isError } = useRouteLines({
    from,
    to,
    sources: sourceFilter.length ? sourceFilter : undefined,
  });

  const months = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of days) m.set(d.date.slice(0, 7), (m.get(d.date.slice(0, 7)) ?? 0) + d.total_distance_miles);
    return [...m.entries()].map(([ym, miles]) => ({ ym, miles }));
  }, [days]);
  const years = useMemo(() => [...new Set(days.map((d) => d.date.slice(0, 4)))], [days]);

  const update = useCallback(
    (next: Record<string, string | null>) => {
      setSp(
        (prev) => {
          const out = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(next)) {
            if (v == null) out.delete(k);
            else out.set(k, v);
          }
          return out;
        },
        { replace: true },
      );
    },
    [setSp],
  );

  const ym = from.slice(0, 7);
  const step = useCallback(
    (dir: 1 | -1) => {
      if (period === 'month') {
        const idx = months.findIndex((m) => m.ym === ym);
        const target = months[idx + dir]?.ym ?? format(addMonths(parseISO(`${ym}-01`), dir), 'yyyy-MM');
        update({ ym: target });
      } else if (period === 'year') {
        update({ y: String(Number(from.slice(0, 4)) + dir) });
      } else if (period === 'day') {
        const idx = days.findIndex((d) => d.date === from);
        update({ d: days[idx + dir]?.date ?? format(addDays(parseISO(from), dir), 'yyyy-MM-dd') });
      }
    },
    [period, months, ym, from, days, update],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey) return;
      if (e.key === '[') step(-1);
      else if (e.key === ']') step(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step]);

  // Keep the selected month chip in view.
  useEffect(() => {
    stripRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [ym, period]);

  const modeEntries = Object.entries(data?.modes ?? {}).sort((a, b) => b[1].miles - a[1].miles);
  const shownMiles = modeEntries
    .filter(([m]) => !hiddenModes.includes(m))
    .reduce((s, [, v]) => s + v.miles, 0);
  const guesses = data?.lines.filter((l) => !l.recorded).length ?? 0;

  const title =
    period === 'day'
      ? format(parseISO(from), 'EEE d MMM yyyy')
      : period === 'month'
        ? format(parseISO(from), 'MMMM yyyy')
        : period === 'year'
          ? from.slice(0, 4)
          : `${from} to ${to}`;

  const panel = (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface">
      <div className="shrink-0 space-y-3 border-b border-border p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <RouteIcon size={20} className="text-accent" />
            <h2 className="text-lg font-semibold">Routes</h2>
          </div>
          {period !== 'range' && (
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" title="Previous period ([)" aria-label="Previous period" onClick={() => step(-1)}>
                <ChevronLeft size={16} />
              </Button>
              <Button variant="outline" size="icon" title="Next period (])" aria-label="Next period" onClick={() => step(1)}>
                <ChevronRight size={16} />
              </Button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-4 gap-1 rounded-lg bg-bg p-1" role="tablist" aria-label="Period">
          {PERIODS.map((p) => (
            <Button
              key={p.id}
              role="tab"
              aria-selected={period === p.id}
              variant={period === p.id ? 'default' : 'ghost'}
              size="sm"
              title={p.title}
              onClick={() => update({ period: p.id })}
            >
              {p.label}
            </Button>
          ))}
        </div>

        <div className="flex items-baseline justify-between gap-2">
          <div className="text-sm font-medium text-text">{title}</div>
          {isFetching && <Loader2 size={14} className="animate-spin text-accent" />}
        </div>

        {period === 'month' && (
          <div ref={stripRef} className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
            {months.map((m) => (
              <Button
                key={m.ym}
                data-active={m.ym === ym}
                variant={m.ym === ym ? 'default' : 'outline'}
                size="sm"
                className="shrink-0 flex-col gap-0 py-1 leading-tight"
                title={`Show every journey in ${format(parseISO(`${m.ym}-01`), 'MMMM yyyy')}`}
                onClick={() => update({ ym: m.ym })}
              >
                <span className="text-xs font-semibold">{format(parseISO(`${m.ym}-01`), 'MMM yy')}</span>
                <span className="text-[10px] opacity-75">{formatMilesOrKm(m.miles, unit)}</span>
              </Button>
            ))}
          </div>
        )}

        {period === 'year' && (
          <div className="flex flex-wrap gap-1">
            {years.map((y) => (
              <Button
                key={y}
                variant={y === from.slice(0, 4) ? 'default' : 'outline'}
                size="sm"
                title={`Show every journey in ${y}`}
                onClick={() => update({ y })}
              >
                {y}
              </Button>
            ))}
          </div>
        )}

        {period === 'day' && (
          <DayCalendar days={days} selectedDate={from} onSelectDate={(d) => update({ d })} />
        )}

        {period === 'range' && (
          <div className="grid grid-cols-2 gap-2 text-xs text-text-muted">
            <label className="flex flex-col gap-1">
              From
              <input
                type="date"
                value={from}
                title="First day of the range"
                onChange={(e) => update({ from: e.target.value })}
                className="rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-text transition-colors duration-ui-fast ease-ui hover:border-accent"
              />
            </label>
            <label className="flex flex-col gap-1">
              To
              <input
                type="date"
                value={to}
                title="Last day of the range (up to a year after the first)"
                onChange={(e) => update({ to: e.target.value })}
                className="rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-text transition-colors duration-ui-fast ease-ui hover:border-accent"
              />
            </label>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {isError && <p className="text-sm text-train">Could not load routes for this period.</p>}
        {data && (
          <>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-lg font-semibold text-accent">{formatMilesOrKm(shownMiles, unit)}</div>
                <div className="text-xs text-text-muted">Shown</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-walk">{data.lines.length}</div>
                <div className="text-xs text-text-muted">Journeys</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-visit">{data.days}</div>
                <div className="text-xs text-text-muted">Days</div>
              </div>
            </div>
            {data.truncated && (
              <p className="text-xs text-text-muted">Ranges are capped at a year; showing up to {data.to}.</p>
            )}

            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Modes</div>
              <div className="flex flex-col gap-1">
                {modeEntries.map(([mode, v]) => {
                  const hidden = hiddenModes.includes(mode);
                  const color = MODE_COLORS[mode] || 'var(--text-muted)';
                  return (
                    <Button
                      key={mode}
                      variant="ghost"
                      size="sm"
                      aria-pressed={!hidden}
                      title={hidden ? `Show ${MODE_LABELS[mode] || mode} journeys` : `Hide ${MODE_LABELS[mode] || mode} journeys`}
                      onClick={() =>
                        setHiddenModes((cur) => (cur.includes(mode) ? cur.filter((m) => m !== mode) : [...cur, mode]))
                      }
                      className={cn('justify-between', hidden && 'opacity-40')}
                    >
                      <span className="flex items-center gap-2">
                        <span className="h-1 w-5 rounded-full" style={{ background: color }} />
                        {MODE_LABELS[mode] || mode}
                      </span>
                      <span className="text-xs text-text-muted">
                        {v.count} · {formatMilesOrKm(v.miles, unit)}
                      </span>
                    </Button>
                  );
                })}
                {!modeEntries.length && <p className="text-sm text-text-muted">No journeys in this period.</p>}
              </div>
            </div>

            {sources && sources.length > 1 && (
              <div className="flex flex-wrap gap-1">
                {sources.map((s) => {
                  const on = sourceFilter.length === 0 || sourceFilter.includes(s.id);
                  return (
                    <Button
                      key={s.id}
                      variant={on ? 'default' : 'outline'}
                      size="sm"
                      title={on ? `Hide ${s.label}` : `Show ${s.label}`}
                      onClick={() =>
                        setSourceFilter((cur) => {
                          if (cur.includes(s.id)) return cur.filter((id) => id !== s.id);
                          if (cur.length === 0) return sources.filter((x) => x.id !== s.id).map((x) => x.id);
                          return [...cur, s.id];
                        })
                      }
                    >
                      {s.label}
                    </Button>
                  );
                })}
              </div>
            )}

            <p className="text-xs text-text-muted">
              Lines follow your recorded GPS points.
              {guesses > 0 && ` ${guesses} journey${guesses === 1 ? '' : 's'} without GPS ${guesses === 1 ? 'is' : 'are'} dashed straight lines.`}
              {' '}Tap a line to open that day.
            </p>
          </>
        )}
      </div>
    </div>
  );

  const showEverything = () => {
    const pts = (data?.lines ?? []).filter((l) => !hiddenModes.includes(l.mode)).flatMap((l) => l.coords);
    if (pts.length) setFocusTarget({ bounds: pts });
  };

  const map = (
    <div className="relative min-h-0 flex-1">
      <MapView
        routeLines={data?.lines}
        hiddenModes={hiddenModes}
        sizeSignal={sizeSignal}
        focusTarget={focusTarget}
        hideMiniMap={Boolean(data?.lines.length)}
      />
      {Boolean(data?.lines.length) && (
        <div className="pointer-events-none absolute bottom-10 left-3 z-[1000]">
          <Button
            variant="outline"
            size="sm"
            className="pointer-events-auto bg-surface"
            title="Zoom out to show every journey in this period, including trips abroad"
            onClick={showEverything}
          >
            Show everything
          </Button>
        </div>
      )}
    </div>
  );

  if (isDesktop) {
    return (
      <div className="flex h-full min-h-0">
        <div className="flex w-96 shrink-0 flex-col overflow-hidden border-r border-border bg-surface">{panel}</div>
        {map}
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0">
      <div className="relative min-h-0 flex-1">
        {map}
        <MobilePanelOpenButton label="Show routes panel" visible={!panelOpen} onClick={() => setPanelOpen(true)} />
        <MobilePanel
          open={panelOpen}
          onOpenChange={setPanelOpen}
          height={sheetHeight}
          onHeightChange={setSheetHeight}
          title="Routes"
          onLayoutChange={() => setSizeSignal((n) => n + 1)}
          bodyClassName="flex min-h-0 flex-col overflow-hidden"
        >
          {panel}
        </MobilePanel>
      </div>
    </div>
  );
}
