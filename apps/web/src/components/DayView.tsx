import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDayData, useDays, useSources } from '../hooks/useApi';
import { useBreakpoint } from '../hooks/useBreakpoint';
import MapView from './Map';
import Timeline from './Timeline';
import DayCalendar from './DayCalendar';
import DayPlaybackBar from './DayPlaybackBar';
import MobilePanel, { MobilePanelOpenButton, type MobilePanelHeight } from './MobilePanel';
import { formatDate, formatMilesOrKm } from '../utils/format';
import { useUnits } from '../lib/units';
import { MODE_COLORS, MODE_LABELS } from '../types';
import type { Visit, Activity, Connector, MapFocusTarget } from '../types';
import {
  buildPlaybackSegments,
  playbackRange,
  positionAt,
  PLAYBACK_SPEEDS,
  DEFAULT_PLAYBACK_SPEED,
  type PlaybackSpeed,
} from '../lib/dayPlayback';
import { sunTimes } from '../utils/sunTimes';
import { isTypingTarget } from '../lib/command-query';
import { sourceTokenVar } from '../lib/hotspots';
import { Button } from './ui/button';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Loader2,
} from 'lucide-react';

function focusTargetForVisit(v: Visit): MapFocusTarget {
  return { lat: v.lat, lon: v.lon, zoom: 16 };
}

function focusTargetForActivity(a: Activity): MapFocusTarget {
  if (a.route_geometry && a.route_geometry.length > 1) {
    return { bounds: a.route_geometry.map((c) => [c[0], c[1]] as [number, number]) };
  }
  return {
    bounds: [
      [a.start_lat, a.start_lon],
      [a.end_lat, a.end_lon],
    ],
  };
}

function focusTargetForConnector(c: Connector): MapFocusTarget {
  if (c.route_geometry && c.route_geometry.length > 1) {
    return { bounds: c.route_geometry.map((p) => [p[0], p[1]] as [number, number]) };
  }
  return {
    bounds: [
      [c.from_lat, c.from_lon],
      [c.to_lat, c.to_lon],
    ],
  };
}

interface Props {
  initialDate?: string;
}

export default function DayView({ initialDate }: Props) {
  const navigate = useNavigate();
  const { data: allDays } = useDays();
  const { isDesktop, isPhone, isTablet } = useBreakpoint();
  const { unit, timezone } = useUnits();
  const [selectedDate, setSelectedDate] = useState(initialDate || '');
  const [mapFocus, setMapFocus] = useState<MapFocusTarget | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) {
      return false;
    }
    return true;
  });
  const [panelOpen, setPanelOpen] = useState(true);
  const [sheetHeight, setSheetHeight] = useState<MobilePanelHeight>('half');
  const [sizeSignal, setSizeSignal] = useState(0);
  const [prevInitialDate, setPrevInitialDate] = useState(initialDate);
  const [playTime, setPlayTime] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<PlaybackSpeed>(DEFAULT_PLAYBACK_SPEED);
  const [followPlayhead, setFollowPlayhead] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<string[]>([]);
  const { data: sources } = useSources();
  const { data: dayData, isLoading, isFetching, progress } = useDayData(
    selectedDate,
    sourceFilter.length ? sourceFilter : undefined,
  );

  const sourceColors = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of sources ?? []) map[s.id] = sourceTokenVar(s.color);
    return map;
  }, [sources]);

  const bumpSize = useCallback(() => setSizeSignal((n) => n + 1), []);

  const segments = useMemo(() => {
    if (!selectedDate || !dayData || 'error' in dayData) return [];
    return buildPlaybackSegments(selectedDate, dayData.visits, dayData.activities, dayData.connectors);
  }, [dayData, selectedDate]);

  const range = useMemo(() => playbackRange(segments), [segments]);
  const rangeKey = range ? `${selectedDate}:${range.startMs}:${range.endMs}` : '';
  const [prevRangeKey, setPrevRangeKey] = useState(rangeKey);
  if (rangeKey !== prevRangeKey) {
    setPrevRangeKey(rangeKey);
    setPlaying(false);
    setFollowPlayhead(false);
    setPlayTime(range?.startMs ?? null);
  }

  const playTimeRef = useRef(playTime);
  const speedRef = useRef(speed);
  const rangeRef = useRef(range);
  useEffect(() => {
    playTimeRef.current = playTime;
    speedRef.current = speed;
    rangeRef.current = range;
  });

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const r = rangeRef.current;
      if (!r) {
        setPlaying(false);
        return;
      }
      const dt = now - last;
      last = now;
      const advanceMs = (speedRef.current * 60_000 * dt) / 1000;
      const next = Math.min(r.endMs, (playTimeRef.current ?? r.startMs) + advanceMs);
      setPlayTime(next);
      if (next >= r.endMs) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const playheadPos = useMemo(() => {
    if (playTime == null || segments.length === 0) return null;
    return positionAt(segments, playTime);
  }, [segments, playTime]);

  const sunLoc = useMemo(() => {
    if (!dayData || 'error' in dayData) return null;
    const v = dayData.visits[0];
    if (v) return { lat: v.lat, lon: v.lon };
    const a = dayData.activities[0];
    if (a) return { lat: a.start_lat, lon: a.start_lon };
    return null;
  }, [dayData]);

  const sun = useMemo(() => {
    if (!sunLoc || !selectedDate) return { sunrise: null as Date | null, sunset: null as Date | null };
    return sunTimes(sunLoc.lat, sunLoc.lon, selectedDate);
  }, [sunLoc, selectedDate]);

  const seek = useCallback((t: number) => {
    setPlayTime(t);
    setFollowPlayhead(true);
    setMapFocus(null);
  }, []);

  const togglePlay = useCallback(() => {
    const r = rangeRef.current;
    if (!r) return;
    if (playing) {
      setPlaying(false);
      return;
    }
    const t = playTimeRef.current ?? r.startMs;
    if (t >= r.endMs) setPlayTime(r.startMs);
    setFollowPlayhead(true);
    setMapFocus(null);
    setPlaying(true);
  }, [playing]);

  const cycleSpeed = useCallback(() => {
    setSpeed((s) => PLAYBACK_SPEEDS[(PLAYBACK_SPEEDS.indexOf(s) + 1) % PLAYBACK_SPEEDS.length]);
  }, []);

  const handleVisitOnMap = useCallback((v: Visit) => {
    setPlaying(false);
    setFollowPlayhead(false);
    setPlayTime(Date.parse(v.start));
    setMapFocus(focusTargetForVisit(v));
  }, []);

  const handleActivityOnMap = useCallback((a: Activity) => {
    setPlaying(false);
    setFollowPlayhead(false);
    setPlayTime(Date.parse(a.start));
    setMapFocus(focusTargetForActivity(a));
  }, []);

  const handleUnknownOnMap = useCallback((connector: Connector | null, startIso: string) => {
    setPlaying(false);
    setFollowPlayhead(false);
    setPlayTime(Date.parse(startIso));
    if (connector) setMapFocus(focusTargetForConnector(connector));
    else setMapFocus(null);
  }, []);

  const dateList = useMemo(
    () => allDays?.map((d) => d.date) ?? [],
    [allDays],
  );

  const setDateAndClearFocus = useCallback(
    (date: string) => {
      setSelectedDate(date);
      setMapFocus(null);
      void navigate(`/day/${date}`);
    },
    [navigate],
  );

  if (initialDate !== prevInitialDate) {
    setPrevInitialDate(initialDate);
    if (initialDate && initialDate !== selectedDate) {
      setSelectedDate(initialDate);
      setMapFocus(null);
    }
  } else if (!selectedDate && dateList.length) {
    setSelectedDate(dateList[dateList.length - 1]);
  }

  const currentIdx = dateList.indexOf(selectedDate);
  const canPrev = currentIdx > 0;
  const canNext = currentIdx >= 0 && currentIdx < dateList.length - 1;

  const goToPrev = useCallback(() => {
    if (canPrev) setDateAndClearFocus(dateList[currentIdx - 1]);
  }, [canPrev, currentIdx, dateList, setDateAndClearFocus]);
  const goToNext = useCallback(() => {
    if (canNext) setDateAndClearFocus(dateList[currentIdx + 1]);
  }, [canNext, currentIdx, dateList, setDateAndClearFocus]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey) return;
      if (e.key === '[') {
        e.preventDefault();
        goToPrev();
      } else if (e.key === ']') {
        e.preventDefault();
        goToNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goToPrev, goToNext]);

  const iconBtn =
    'flex h-11 w-11 items-center justify-center rounded border border-border transition-colors duration-ui-fast ease-ui hover:bg-bg disabled:cursor-not-allowed disabled:opacity-30';

  const barInPanel =
    !isDesktop && ((isPhone && panelOpen && sheetHeight === 'full') || (isTablet && panelOpen));

  const playbackBar =
    range && playTime != null ? (
      <DayPlaybackBar
        rangeStart={range.startMs}
        rangeEnd={range.endMs}
        time={playTime}
        playing={playing}
        speed={speed}
        sunriseMs={sun.sunrise?.getTime() ?? null}
        sunsetMs={sun.sunset?.getTime() ?? null}
        timezone={timezone}
        compact={!isDesktop}
        onTogglePlay={togglePlay}
        onCycleSpeed={cycleSpeed}
        onSeek={seek}
      />
    ) : null;

  const overlayClass = isDesktop
    ? 'bottom-3 left-3 w-[min(22rem,calc(100%-11rem))]'
    : isTablet
      ? 'left-3 right-3 bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px)+0.75rem)]'
      : !panelOpen || sheetHeight === 'peek'
        ? 'left-3 right-3 bottom-[calc(38%+0.5rem)]'
        : 'left-3 right-3 bottom-[calc(55%+0.5rem)]';

  const mapProps = {
    visits: dayData && !('error' in dayData) ? dayData.visits : undefined,
    activities: dayData && !('error' in dayData) ? dayData.activities : undefined,
    connectors: dayData && !('error' in dayData) ? dayData.connectors : undefined,
    focusTarget: mapFocus,
    sizeSignal,
    playhead: playheadPos ? { lat: playheadPos.lat, lon: playheadPos.lon } : null,
    followPlayhead,
    dayDate: selectedDate || undefined,
    sourceColors,
  };

  const sourceChips =
    sources && sources.length > 1 ? (
      <div className="mt-3 flex flex-wrap gap-1">
        {sources.map((s) => {
          const on = sourceFilter.includes(s.id) || sourceFilter.length === 0;
          return (
            <Button
              key={s.id}
              type="button"
              variant={on ? 'default' : 'outline'}
              size="sm"
              title={on ? `Hide ${s.label}` : `Show ${s.label}`}
              onClick={() =>
                setSourceFilter((current) => {
                  if (current.includes(s.id)) return current.filter((id) => id !== s.id);
                  if (current.length === 0) return sources.filter((x) => x.id !== s.id).map((x) => x.id);
                  return [...current, s.id];
                })
              }
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: sourceTokenVar(s.color) }} />
              {s.label}
            </Button>
          );
        })}
      </div>
    ) : null;

  const sidePanel = (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface">
      <div className="shrink-0 border-b border-border p-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Calendar size={20} className="text-accent" />
            <h2 className="text-lg font-semibold">Day View</h2>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={goToPrev}
              disabled={!canPrev}
              className={iconBtn}
              aria-label="Previous day with data"
              title="Go to previous day with data"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={goToNext}
              disabled={!canNext}
              className={iconBtn}
              aria-label="Next day with data"
              title="Go to next day with data"
            >
              <ChevronRight size={16} />
            </button>
            <button
              type="button"
              onClick={() => setCalendarOpen((o) => !o)}
              className={iconBtn}
              aria-expanded={calendarOpen}
              aria-label={calendarOpen ? 'Hide calendar' : 'Show calendar'}
              title={calendarOpen ? 'Hide calendar' : 'Show calendar'}
            >
              <ChevronDown
                size={16}
                className={`transition-transform duration-ui-drawer ease-ui-drawer ${
                  calendarOpen ? 'rotate-180' : 'rotate-0'
                }`}
              />
            </button>
          </div>
        </div>

        {selectedDate && (
          <div className="text-sm text-text-muted">{formatDate(selectedDate)}</div>
        )}
        {sourceChips}

        {allDays && allDays.length > 0 && (
          <div
            className={`grid transition-[grid-template-rows,opacity] duration-ui-drawer ease-ui-drawer ${
              calendarOpen
                ? 'grid-rows-[1fr] opacity-100'
                : 'grid-rows-[0fr] opacity-0'
            }`}
          >
            <div className="min-h-0 overflow-hidden">
              <DayCalendar
                days={allDays}
                selectedDate={selectedDate}
                onSelectDate={setDateAndClearFocus}
              />
            </div>
          </div>
        )}
      </div>

      {dayData && !('error' in dayData) && (
        <div className="shrink-0 border-b border-border p-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-lg font-semibold text-accent">
                {formatMilesOrKm(dayData.total_distance_miles, unit)}
              </div>
              <div className="text-xs text-text-muted">Total</div>
            </div>
            <div>
              <div className="text-lg font-semibold text-visit">
                {dayData.visits.length}
              </div>
              <div className="text-xs text-text-muted">Visits</div>
            </div>
            <div>
              <div className="text-lg font-semibold text-walk">
                {dayData.activities.length}
              </div>
              <div className="text-xs text-text-muted">Journeys</div>
            </div>
          </div>

          {Object.keys(dayData.modes).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(dayData.modes).map(([mode, count]) => (
                <span
                  key={mode}
                  className="rounded-full px-2 py-0.5 text-xs"
                  style={{
                    backgroundColor: `${MODE_COLORS[mode] || 'var(--text-muted)'}22`,
                    color: MODE_COLORS[mode] || 'var(--text-muted)',
                  }}
                >
                  {MODE_LABELS[mode] || mode} ({count})
                </span>
              ))}
            </div>
          )}

          {dayData.clusters.length > 0 && (
            <div className="mt-2 text-xs text-text-muted">
              {dayData.clusters.join(' / ')}
            </div>
          )}
        </div>
      )}

      {barInPanel && playbackBar && (
        <div className="shrink-0 border-b border-border p-3">{playbackBar}</div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading || (isFetching && progress) ? (
          <div className="flex flex-col gap-4 p-6">
            <div className="flex items-center gap-3">
              <Loader2 size={22} className="shrink-0 animate-spin text-accent" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="truncate text-sm font-medium text-text">
                    {progress?.stage ?? 'Loading day…'}
                  </div>
                  <div className="shrink-0 font-mono text-sm text-accent">
                    {Math.round(progress?.percent ?? 0)}%
                  </div>
                </div>
                {progress?.detail && (
                  <div className="mt-0.5 truncate text-xs text-text-muted">{progress.detail}</div>
                )}
              </div>
            </div>

            <div className="h-1.5 overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-ui-progress ease-ui"
                style={{ width: `${Math.min(100, Math.max(0, progress?.percent ?? 0))}%` }}
              />
            </div>

            <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-bg/50 px-3 py-2 font-mono text-[11px] leading-relaxed text-text-muted">
              {(progress?.logs?.length ? progress.logs : ['Waiting for server…']).map(
                (line, i) => (
                  <div key={`${i}-${line}`} className="truncate">
                    <span className="text-accent/70">›</span> {line}
                  </div>
                ),
              )}
            </div>
          </div>
        ) : dayData && !('error' in dayData) ? (
          <Timeline
            visits={dayData.visits}
            activities={dayData.activities}
            connectors={dayData.connectors}
            date={selectedDate}
            activeTime={playTime}
            onVisitClick={handleVisitOnMap}
            onActivityClick={handleActivityOnMap}
            onUnknownClick={handleUnknownOnMap}
            sourceColors={sourceColors}
          />
        ) : (
          <div className="p-4 text-sm text-text-muted">
            {selectedDate
              ? 'No data for this date'
              : 'Select a date to view'}
          </div>
        )}
      </div>
    </div>
  );

  const mapWithOverlay = (
    <div className="relative min-h-0 flex-1">
      <MapView {...mapProps} />
      {!barInPanel && playbackBar && (
        <div className={`pointer-events-none absolute z-[1000] ${overlayClass}`}>
          <div className="pointer-events-auto">{playbackBar}</div>
        </div>
      )}
    </div>
  );

  const mapPane = (
    <div className="relative min-h-0 flex-1">
      {mapWithOverlay}
      <MobilePanelOpenButton
        label="Show day panel"
        visible={!panelOpen}
        onClick={() => setPanelOpen(true)}
      />
      <MobilePanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        height={sheetHeight}
        onHeightChange={setSheetHeight}
        title="Day View"
        onLayoutChange={bumpSize}
        bodyClassName="flex min-h-0 flex-col overflow-hidden"
      >
        {sidePanel}
      </MobilePanel>
    </div>
  );

  if (isDesktop) {
    return (
      <div className="flex h-full min-h-0">
        <div className="flex w-96 shrink-0 flex-col overflow-hidden border-r border-border bg-surface">
          {sidePanel}
        </div>
        {mapWithOverlay}
      </div>
    );
  }

  return <div className="relative flex h-full min-h-0">{mapPane}</div>;
}
