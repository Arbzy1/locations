import { useState, useMemo } from 'react';
import { useHeatmap } from '../hooks/useApi';
import MapView from './Map';
import { Flame, MapPin } from 'lucide-react';
import { formatDuration } from '../utils/format';
import type { HeatmapPoint, HotspotLabel, MapFocusTarget } from '../types';

type HotspotArea = HeatmapPoint & {
  label: string;
  totalDurationMinutes: number;
  uniqueDays: number;
  topTypes: string[];
};

function toArea(p: HeatmapPoint): HotspotArea {
  return {
    ...p,
    label: p.label || `Near ${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}`,
    totalDurationMinutes: p.totalDurationMinutes ?? 0,
    uniqueDays: p.uniqueDays ?? 0,
    topTypes: p.topTypes ?? [],
  };
}

export default function HotspotsView() {
  const { data: heatmapPoints, isLoading } = useHeatmap();
  const [heatmapOn, setHeatmapOn] = useState(true);
  /** 15-100: how solid the heat is; lower = easier to read town names on the basemap */
  const [opacityPct, setOpacityPct] = useState(72);
  /** 40-180: 100 = default strength */
  const [intensityPct, setIntensityPct] = useState(100);
  const [focusTarget, setFocusTarget] = useState<MapFocusTarget | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

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
      topAreas.slice(0, 12).map((a, i) => ({
        lat: a.lat,
        lon: a.lon,
        label: a.label,
        count: a.count,
        rank: i + 1,
      })),
    [topAreas],
  );

  const areaKey = (a: HotspotArea) => `${a.lat},${a.lon}`;

  const onSelectArea = (area: HotspotArea) => {
    setSelectedKey(areaKey(area));
    setFocusTarget({ lat: area.lat, lon: area.lon, zoom: 15 });
  };

  return (
    <div className="flex h-full">
      <div className="w-80 shrink-0 bg-surface border-r border-border overflow-y-auto">
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Flame size={20} className="text-train" />
            Hotspots
          </h2>
          <p className="text-text-muted text-sm mt-1">
            {heatmapPoints ? `${heatmapPoints.length} locations` : 'Loading...'}
          </p>
          <p className="text-text-muted text-xs mt-2 leading-relaxed">
            Hover a row for details. Click to zoom the map. Tags mark top spots on the map.
          </p>
        </div>

        {isLoading ? (
          <div className="p-4 text-text-muted text-sm">Loading heatmap data...</div>
        ) : (
          <div className="p-2">
            {topAreas.map((area, i) => {
              const key = areaKey(area);
              const selected = selectedKey === key;
              const tipTitle = `${area.label}: ${area.count} visits`;
              return (
                <div key={key} className="relative group">
                  <button
                    type="button"
                    title={tipTitle}
                    onClick={() => onSelectArea(area)}
                    className={`w-full flex items-center gap-3 p-2 rounded text-left transition-colors duration-ui-emphasis ease-ui hover:bg-bg/50 ${
                      selected ? 'bg-bg/70 ring-1 ring-accent/40' : ''
                    }`}
                  >
                    <div className="text-text-muted text-sm font-mono w-6 text-right shrink-0">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate mb-1">{area.label}</div>
                      <div className="h-2 rounded-full bg-bg overflow-hidden">
                        <div
                          className="h-full rounded-full transition-[width] duration-ui-emphasis ease-ui"
                          style={{
                            width: `${(area.count / maxAreaCount) * 100}%`,
                            background: `linear-gradient(90deg, #58a6ff, #f47067)`,
                          }}
                        />
                      </div>
                    </div>
                    <div className="text-sm text-text-muted font-mono shrink-0">
                      {area.count}
                    </div>
                  </button>

                  <div
                    className="pointer-events-none absolute left-2 right-2 top-full z-20 mt-1
                      opacity-0 invisible scale-95 translate-y-1
                      group-hover:opacity-100 group-hover:visible group-hover:scale-100 group-hover:translate-y-0
                      transition-[opacity,transform,visibility] duration-ui-emphasis ease-ui
                      rounded-lg border border-border bg-surface shadow-lg p-3"
                    role="tooltip"
                  >
                    <div className="text-sm font-semibold text-text leading-snug mb-2">
                      {area.label}
                    </div>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
                      <dt className="text-text-muted">Visits</dt>
                      <dd className="font-mono text-right">{area.count}</dd>
                      <dt className="text-text-muted">Days</dt>
                      <dd className="font-mono text-right">{area.uniqueDays}</dd>
                      <dt className="text-text-muted">Time there</dt>
                      <dd className="font-mono text-right">
                        {formatDuration(area.totalDurationMinutes)}
                      </dd>
                      <dt className="text-text-muted">Coords</dt>
                      <dd className="font-mono text-right text-text-muted">
                        {area.lat.toFixed(4)}, {area.lon.toFixed(4)}
                      </dd>
                    </dl>
                    {area.topTypes.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {area.topTypes.map((t) => (
                          <span
                            key={t}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-bg text-text-muted border border-border"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="mt-2 text-[10px] text-text-muted">Click to zoom on map</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex-1 relative min-h-0">
        <MapView
          heatmapPoints={heatmapPoints || []}
          heatmapEnabled={heatmapOn}
          heatmapOpacity={heatmapOpacity}
          heatmapIntensity={heatmapIntensity}
          hotspotLabels={hotspotLabels}
          focusTarget={focusTarget}
        />

        <div className="absolute top-3 right-3 z-[1000] w-[min(100%-1.5rem,17rem)] rounded-lg border border-border bg-surface/95 backdrop-blur-sm p-3 shadow-lg space-y-3 text-left pointer-events-auto">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-text flex items-center gap-1.5">
              <MapPin size={14} className="text-accent shrink-0" />
              Heatmap
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={heatmapOn}
              aria-label={heatmapOn ? 'Turn heatmap off' : 'Turn heatmap on'}
              title={heatmapOn ? 'Turn heatmap off' : 'Turn heatmap on'}
              onClick={() => setHeatmapOn((v) => !v)}
              className={`relative h-7 w-12 rounded-full transition-colors duration-ui-emphasis ease-ui shrink-0 ${
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

          <div className={heatmapOn ? '' : 'opacity-40 pointer-events-none'}>
            <div className="flex justify-between text-xs text-text-muted mb-1">
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
              className="w-full h-2 accent-accent cursor-pointer disabled:cursor-not-allowed"
            />
            <p className="text-[10px] text-text-muted/80 mt-1 leading-snug">
              Lower = town and road names stay readable through the heat.
            </p>
          </div>

          <div className={heatmapOn ? '' : 'opacity-40 pointer-events-none'}>
            <div className="flex justify-between text-xs text-text-muted mb-1">
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
              className="w-full h-2 accent-accent cursor-pointer disabled:cursor-not-allowed"
            />
            <p className="text-[10px] text-text-muted/80 mt-1 leading-snug">
              100% = default. Higher = hotter colours; lower = softer.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
