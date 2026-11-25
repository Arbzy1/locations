import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import CatalogPage from './CatalogPage';
import MapView from '../explorer/Map';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { EjectField } from '../ui/eject-field';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useDayData, useDays, type DayMissing } from '../../hooks/useApi';
import { MODE_LABELS, type Activity, type DayData, type Visit } from '../../types';
import { formatDistance, formatTime } from '../../utils/format';
import { useUnits } from '../../lib/units';

/** The loaded day, or undefined while loading or when the date has no data. */
const loadedDay = (d: DayData | DayMissing | undefined) => (d && 'visits' in d ? d : undefined);

export function ComparePage() {
  const { data: days = [] } = useDays();
  const [params, setParams] = useSearchParams();
  const fallback = days[days.length - 1]?.date ?? '';
  const a = params.get('a') || fallback;
  const b = params.get('b') || days[Math.max(0, days.length - 2)]?.date || fallback;
  const { isDesktop } = useBreakpoint();
  const [tab, setTab] = useState<'a' | 'b'>('a');
  const [sizeSignal, setSizeSignal] = useState(0);
  const dayA = useDayData(a);
  const dayB = useDayData(b);
  useEffect(() => {
    setSizeSignal((n) => n + 1);
  }, [tab, isDesktop, a, b]);
  const setDate = (key: 'a' | 'b', value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next);
  };
  const pane = (which: 'a' | 'b') => {
    const date = which === 'a' ? a : b;
    const data = loadedDay(which === 'a' ? dayA.data : dayB.data);
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <EjectField label={which === 'a' ? 'First date' : 'Second date'} htmlFor={`compare-${which}`}>
          <Input
            id={`compare-${which}`}
            type="date"
            title={which === 'a' ? 'First date' : 'Second date'}
            value={date}
            onChange={(e) => setDate(which, e.target.value)}
          />
        </EjectField>
        <div className="h-64 min-h-0 flex-1 overflow-hidden rounded-lg border border-border">
          <MapView compact sizeSignal={sizeSignal} visits={data?.visits ?? []} activities={data?.activities ?? []} />
        </div>
      </div>
    );
  };
  return (
    <CatalogPage title="Compare days" description="Two imported days. Not a live overlay.">
      {isDesktop ? (
        <div className="flex gap-3">{pane('a')}{pane('b')}</div>
      ) : (
        <div>
          <div className="mb-2 flex gap-2">
            <Button variant={tab === 'a' ? 'default' : 'outline'} title="Show first date" onClick={() => setTab('a')}>
              {a || 'A'}
            </Button>
            <Button variant={tab === 'b' ? 'default' : 'outline'} title="Show second date" onClick={() => setTab('b')}>
              {b || 'B'}
            </Button>
          </div>
          {pane(tab)}
        </div>
      )}
    </CatalogPage>
  );
}

type ReplayStep =
  | { kind: 'visit'; start: string; visit: Visit }
  | { kind: 'activity'; start: string; activity: Activity };

export function ReplayPage() {
  const { data: days = [] } = useDays();
  const { unit, timezone } = useUnits();
  const [params, setParams] = useSearchParams();
  const date = params.get('date') || days[days.length - 1]?.date || '';
  const data = loadedDay(useDayData(date).data);
  const visits = useMemo(() => data?.visits ?? [], [data?.visits]);
  const activities = useMemo(() => data?.activities ?? [], [data?.activities]);

  const steps = useMemo((): ReplayStep[] => {
    const merged: ReplayStep[] = [
      ...visits.map((visit) => ({ kind: 'visit' as const, start: visit.start, visit })),
      ...activities.map((activity) => ({ kind: 'activity' as const, start: activity.start, activity })),
    ];
    merged.sort((x, y) => x.start.localeCompare(y.start));
    return merged;
  }, [visits, activities]);

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const clampedIndex = steps.length > 0 ? Math.min(index, steps.length - 1) : 0;
  const currentStep = steps[clampedIndex];
  const cutoff = currentStep?.start ?? '';

  const shownVisits = useMemo(
    () => (cutoff ? visits.filter((v) => v.start <= cutoff) : []),
    [visits, cutoff],
  );
  const shownActivities = useMemo(
    () => (cutoff ? activities.filter((a) => a.start <= cutoff) : []),
    [activities, cutoff],
  );

  useEffect(() => {
    if (!playing || steps.length === 0) return;
    const id = window.setTimeout(() => {
      setIndex((i) => {
        if (i >= steps.length - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, Math.max(200, 800 / speed));
    return () => window.clearTimeout(id);
  }, [playing, clampedIndex, speed, steps.length]);

  const statusText = useMemo(() => {
    if (!currentStep) return 'No events for this day';
    if (currentStep.kind === 'visit') {
      const current = currentStep.visit;
      const place = current.place_name || current.cluster;
      return `${place} · ${formatTime(current.start, timezone)} · step ${clampedIndex + 1} of ${steps.length}`;
    }
    const act = currentStep.activity;
    const label =
      act.from_place && act.to_place
        ? `${act.from_place} to ${act.to_place}`
        : MODE_LABELS[act.mode] || act.mode;
    return `${label} (${formatDistance(act.distance_meters, unit)}) · ${formatTime(act.start, timezone)} · step ${clampedIndex + 1} of ${steps.length}`;
  }, [currentStep, clampedIndex, steps.length, timezone, unit]);

  return (
    <CatalogPage title="Time-lapse" description="Chronological playback of stops and journeys on one imported day.">
      <EjectField label="Replay date" htmlFor="replay-date">
        <Input
          id="replay-date"
          type="date"
          title="Replay date"
          value={date}
          onChange={(e) => {
            const next = new URLSearchParams(params);
            next.set('date', e.target.value);
            setParams(next);
            setIndex(0);
            setPlaying(false);
          }}
        />
      </EjectField>
      <div className="h-64 overflow-hidden rounded-lg border border-border">
        <MapView
          compact
          sizeSignal={0}
          dayDate={date}
          visits={shownVisits}
          activities={shownActivities}
        />
      </div>
      <input
        type="range"
        min={0}
        max={Math.max(0, steps.length - 1)}
        value={clampedIndex}
        title="Scrub day events chronologically"
        onChange={(e) => setIndex(Number(e.target.value))}
        className="h-11 w-full cursor-pointer accent-accent"
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={steps.length === 0}
          title={playing ? 'Pause replay' : 'Play replay'}
          onClick={() => {
            if (!playing && clampedIndex >= steps.length - 1) setIndex(0);
            setPlaying((p) => !p);
          }}
        >
          {playing ? 'Pause' : 'Play'}
        </Button>
        <Button type="button" variant="outline" title="Slow down replay" onClick={() => setSpeed((s) => Math.max(0.5, s / 2))}>
          Slower
        </Button>
        <Button type="button" variant="outline" title="Speed up replay" onClick={() => setSpeed((s) => Math.min(4, s * 2))}>
          Faster
        </Button>
      </div>
      <p className="text-xs text-text-muted">
        {statusText} · speed {speed}x
      </p>
    </CatalogPage>
  );
}
