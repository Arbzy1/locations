import { useState, useMemo, useCallback } from 'react';
import { useHeatmap } from '../hooks/useApi';
import { useBreakpoint } from '../hooks/useBreakpoint';
import MapView from './Map';
import MobilePanel, { MobilePanelOpenButton, type MobilePanelHeight } from './MobilePanel';
import { Flame, MapPin } from 'lucide-react';
import { formatDuration } from '../utils/format';
import type { HeatmapPoint, HotspotLabel, MapFocusTarget } from '../types';

type HotspotArea = HeatmapPoint & {
  label: string;
  totalDurationMinutes: number;
  uniqueDays: number;
  topTypes: string[];
  settlement: string | null;
};

function toArea(p: HeatmapPoint): HotspotArea {
  return {
    ...p,
    label: p.label || `Near ${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}`,
    totalDurationMinutes: p.totalDurationMinutes ?? 0,
    uniqueDays: p.uniqueDays ?? 0,
    topTypes: p.topTypes ?? [],
    settlement: p.settlement ?? null,
  };
}

function AreaDetails({ area }: { area: HotspotArea }) {
  return (
    <div className="rounded-lg border border-border bg-bg/50 p-3">
      <div className="mb-2 text-sm font-semibold leading-snug text-text">{area.label}</div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
        <dt className="text-text-muted">Visits</dt>
        <dd className="text-right font-mono">{area.count}</dd>
        <dt className="text-text-muted">Days</dt>
        <dd className="text-right font-mono">{area.uniqueDays}</dd>
        <dt className="text-text-muted">Time there</dt>
        <dd className="text-right font-mono">{formatDuration(area.totalDurationMinutes)}</dd>
        {area.settlement && (
          <>
            <dt className="text-text-muted">Area</dt>
            <dd className="text-right">{area.settlement}</dd>
          </>
        )}
        <dt className="text-text-muted">Coords</dt>
        <dd className="text-right font-mono text-text-muted">
          {area.lat.toFixed(4)}, {area.lon.toFixed(4)}
        </dd>
      </dl>
      {area.topTypes.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {area.topTypes.map((t) => (
            <span
              key={t}
              className="rounded border border-border bg-bg px-1.5 py-0.5 text-[10px] text-text-muted"
            >
              {t}
            </span>
          ))}
        </div>
      )}
      <p className="mt-2 text-[10px] text-text-muted">Selected: map zooms to this spot</p>
    </div>
  );
}

export default function HotspotsView() {
  const { data: heatmapPoints, isLoading } = useHeatmap();
  const { isDesktop, isPhone } = useBreakpoint();
  const [heatmapOn, setHeatmapOn] = useState(true);
  /** 15-100: how solid the heat is; lower = easier to read town names on the basemap */
  const [opacityPct, setOpacityPct] = useState(72);
  /** 40-180: 100 = default strength */
  const [intensityPct, setIntensityPct] = useState(100);
  const [focusTarget, setFocusTarget] = useState<MapFocusTarget | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [sheetHeight, setSheetHeight] = useState<MobilePanelHeight>('half');
  const [sizeSignal, setSizeSignal] = useState(0);

  const bumpSize = useCallback(() => setSizeSignal((n) => n + 1), []);

  const heatmapOpacity = opacityPct / 100;
  const heatmapIntensity = useMemo(
    () => Math.max(0.35, Math.min(2, intensityPct / 100)),
    [intensityPct],
  );

  const topAreas = useMemo(() => {
    if (!heatmapPoints?.length) return [] as HotspotArea[];
    return heatmapPoints.slice(0, 20).map((p) => toArea(p));
  }, [heatmapPoints]);

  const maxAreaCount = topAreas[0]?.count ?? 1;

  const hotspotLabels: HotspotLabel[] = useMemo(
    () =>
      topAreas.slice(0, 12).map((a, i) => {
        const showSettlement =
          a.settlement &&
          !a.label.toLowerCase().includes(a.settlement.toLowerCase());
        return {
          lat: a.lat,
          lon: a.lon,
          label: showSettlement ? `${a.label} (${a.settlement})` : a.label,
          count: a.count,
          rank: i + 1,
        };
      }),
    [topAreas],
  );

  const areaKey = (a: HotspotArea) => `${a.lat},${a.lon}`;
  const onSelectArea = (area: HotspotArea) => {
    setSelectedKey(areaKey(area));
    setFocusTarget({ lat: area.lat, lon: area.lon, zoom: 15 });
    if (isPhone) {
      setPanelOpen(true);
      setSheetHeight('half');
    }
  };

  const listHeader = (
    <div className="border-b border-border p-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Flame size={20} className="text-train" />
        Hotspots
      </h2>
      <p className="mt-1 text-sm text-text-muted">
        {heatmapPoints ? `${heatmapPoints.length} locations` : 'Loading...'}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-text-muted">
        Tap a row for details and to zoom the map. Tags mark top spots on the map.
      </p>
    </div>
  );

  const listBody = (
    <>
      {isLoading ? (
        <div className="p-4 text-sm text-text-muted">Loading heatmap data...</div>
      ) : (
        <div className="p-2">
          {topAreas.map((area, i) => {
            const key = areaKey(area);
            const selected = selectedKey === key;
            const tipTitle = `${area.label}: ${area.count} visits`;
            return (
              <div key={key} className="mb-1">
                <button
                  type="button"
                  title={tipTitle}
                  onClick={() => onSelectArea(area)}
                  className={`flex w-full items-center gap-3 rounded p-2.5 text-left transition-colors duration-ui-emphasis ease-ui hover:bg-bg/50 ${
                    selected ? 'bg-bg/70 ring-1 ring-accent/40' : ''
                  }`}
                >
                  <div className="w-6 shrink-0 text-right font-mono text-sm text-text-muted">
                    {i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 truncate text-sm">{area.label}</div>
                    {area.settlement &&
                      !area.label.toLowerCase().includes(area.settlement.toLowerCase()) && (
                        <div className="mb-1 truncate text-[11px] text-text-muted">
                          {area.settlement}
                        </div>
                      )}
                    <div className="h-2 overflow-hidden rounded-full bg-bg">
                      <div
                        className="h-full rounded-full transition-[width] duration-ui-emphasis ease-ui"
                        style={{
                          width: `${(area.count / maxAreaCount) * 100}%`,
                          background:
                            'linear-gradient(90deg, var(--accent), var(--train))',
                        }}
                      />
                    </div>
                  </div>
                  <div className="shrink-0 font-mono text-sm text-text-muted">{area.count}</div>
                </button>
                {selected && (
                  <div className="ui-enter px-2 pb-2 pt-1">
                    <AreaDetails area={area} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  const heatmapControls = (
    <div className="pointer-events-auto absolute top-3 right-3 z-[1000] w-[min(100%-1.5rem,17rem)] space-y-3 rounded-lg border border-border bg-surface/95 p-3 text-left shadow-lg backdrop-blur-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-medium text-text">
          <MapPin size={14} className="shrink-0 text-accent" />
          Heatmap
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={heatmapOn}
          aria-label={heatmapOn ? 'Turn heatmap off' : 'Turn heatmap on'}
          title={heatmapOn ? 'Turn heatmap off' : 'Turn heatmap on'}
          onClick={() => setHeatmapOn((v) => !v)}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-ui-emphasis ease-ui ${
            heatmapOn ? 'bg-accent' : 'bg-border'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-ui-emphasis ease-ui ${
              heatmapOn ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      <div className={heatmapOn ? '' : 'pointer-events-none opacity-40'}>
        <div className="mb-1 flex justify-between text-xs text-text-muted">
          <span>See-through (map labels)</span>
          <span className="font-mono tabular-nums">{opacityPct}%</span>
        </div>
        <input
          type="range"
          min={12}
          max={100}
          value={opacityPct}
          onChange={(e) => setOpacityPct(Number(e.target.value))}
          disabled={!heatmapOn}
          title="Heatmap opacity so map labels stay readable"
          className="h-2 w-full cursor-pointer accent-accent disabled:cursor-not-allowed"
        />
        <p className="mt-1 text-[10px] leading-snug text-text-muted/80">
          Lower = town and road names stay readable through the heat.
        </p>
      </div>

      <div className={heatmapOn ? '' : 'pointer-events-none opacity-40'}>
        <div className="mb-1 flex justify-between text-xs text-text-muted">
          <span>Strength</span>
          <span className="font-mono tabular-nums">{intensityPct}%</span>
        </div>
        <input
          type="range"
          min={40}
          max={180}
          step={5}
          value={intensityPct}
          onChange={(e) => setIntensityPct(Number(e.target.value))}
          disabled={!heatmapOn}
          title="Heatmap colour strength"
          className="h-2 w-full cursor-pointer accent-accent disabled:cursor-not-allowed"
        />
        <p className="mt-1 text-[10px] leading-snug text-text-muted/80">
          100% = default. Higher = hotter colours; lower = softer.
        </p>
      </div>
    </div>
  );

  const mapPane = (
    <div className="relative min-h-0 flex-1">
      <MapView
        heatmapPoints={heatmapPoints || []}
        heatmapEnabled={heatmapOn}
        heatmapOpacity={heatmapOpacity}
        heatmapIntensity={heatmapIntensity}
        hotspotLabels={hotspotLabels}
        focusTarget={focusTarget}
        sizeSignal={sizeSignal}
      />
      {heatmapControls}
      <MobilePanelOpenButton
        label="Show hotspots"
        visible={!panelOpen}
        onClick={() => setPanelOpen(true)}
      />
      <MobilePanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        height={sheetHeight}
        onHeightChange={setSheetHeight}
        title="Hotspots"
        onLayoutChange={bumpSize}
      >
        {listHeader}
        {listBody}
      </MobilePanel>
    </div>
  );

  if (isDesktop) {
    return (
      <div className="flex h-full">
        <div className="w-80 shrink-0 overflow-y-auto border-r border-border bg-surface">
          {listHeader}
          {listBody}
        </div>
        <div className="relative min-h-0 flex-1">
          <MapView
            heatmapPoints={heatmapPoints || []}
            heatmapEnabled={heatmapOn}
            heatmapOpacity={heatmapOpacity}
            heatmapIntensity={heatmapIntensity}
            hotspotLabels={hotspotLabels}
            focusTarget={focusTarget}
            sizeSignal={sizeSignal}
          />
          {heatmapControls}
        </div>
      </div>
    );
  }

  return <div className="relative flex h-full min-h-0">{mapPane}</div>;
}
