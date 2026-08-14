import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import CatalogPage from './CatalogPage';
import MapView from '../Map';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useDayData, useDays } from '../../hooks/useApi';
import type { Visit } from '../../types';

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
    const data = which === 'a' ? dayA.data : dayB.data;
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <Input
          type="date"
          title={which === 'a' ? 'First date' : 'Second date'}
          value={date}
          onChange={(e) => setDate(which, e.target.value)}
        />
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

export function ReplayPage() {
  const { data: days = [] } = useDays();
  const [params, setParams] = useSearchParams();
  const date = params.get('date') || days[days.length - 1]?.date || '';
  const { data } = useDayData(date);
  const visits = data?.visits ?? [];
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const shown: Visit[] = visits.slice(0, Math.max(1, index + 1));
  const current = visits[index];

  useEffect(() => {
    if (!playing || visits.length === 0) return;
    const id = window.setTimeout(() => {
      setIndex((i) => {
        if (i >= visits.length - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, Math.max(200, 800 / speed));
    return () => window.clearTimeout(id);
  }, [playing, index, speed, visits.length]);

  return (
    <CatalogPage title="Time-lapse" description="Playback of one imported day. Map tiles stay native.">
      <Input
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
      <div className="h-64 overflow-hidden rounded-lg border border-border">
          <MapView compact sizeSignal={index} visits={shown} activities={data?.activities ?? []} />
      </div>
      <input
        type="range"
        min={0}
        max={Math.max(0, visits.length - 1)}
        value={index}
        title="Scrub visits"
        onChange={(e) => setIndex(Number(e.target.value))}
        className="w-full"
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" title={playing ? 'Pause replay' : 'Play replay'} onClick={() => setPlaying((p) => !p)}>
          {playing ? 'Pause' : 'Play'}
        </Button>
        <Button type="button" variant="outline" title="Slower" onClick={() => setSpeed((s) => Math.max(0.5, s / 2))}>
          Slower
        </Button>
        <Button type="button" variant="outline" title="Faster" onClick={() => setSpeed((s) => Math.min(4, s * 2))}>
          Faster
        </Button>
      </div>
      <p className="text-xs text-text-muted">
        {current ? `${current.cluster} · stop ${index + 1} of ${visits.length}` : 'No visits'} · speed {speed}x
      </p>
    </CatalogPage>
  );
}
