import { useState, useMemo } from 'react';
import { useHeatmap } from '../hooks/useApi';
import MapView from './Map';
import { Flame, MapPin } from 'lucide-react';

export default function HotspotsView() {
  const { data: heatmapPoints, isLoading } = useHeatmap();
  const [heatmapOn, setHeatmapOn] = useState(true);
  /** 15–100: how solid the heat is; lower = easier to read town names on the basemap */
  const [opacityPct, setOpacityPct] = useState(72);
  /** 40–180: 100 = default strength */
  const [intensityPct, setIntensityPct] = useState(100);

  const heatmapOpacity = opacityPct / 100;
  const heatmapIntensity = useMemo(
    () => Math.max(0.35, Math.min(2, intensityPct / 100)),
    [intensityPct],
  );

  // Aggregate by rough area for the sidebar list
  const clusterCounts: Record<string, { count: number; lat: number; lon: number }> = {};
  if (heatmapPoints) {
    for (const p of heatmapPoints) {
      const key = `${(p.lat * 100) | 0},${(p.lon * 100) | 0}`;
      if (!clusterCounts[key]) {
        clusterCounts[key] = { count: 0, lat: p.lat, lon: p.lon };
      }
      clusterCounts[key].count += p.count;
    }
  }

  const topAreas = Object.values(clusterCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
  const maxAreaCount = topAreas[0]?.count ?? 1;

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
            Use the panel on the map to turn the heat off, fade it to read place names, or change
            strength.
          </p>
        </div>

        {isLoading ? (
          <div className="p-4 text-text-muted text-sm">Loading heatmap data...</div>
        ) : (
          <div className="p-2">
            {topAreas.map((area, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-2 rounded hover:bg-bg/50"
              >
                <div className="text-text-muted text-sm font-mono w-6 text-right">
                  {i + 1}
                </div>
                <div className="flex-1">
                  <div className="h-2 rounded-full bg-bg overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(area.count / maxAreaCount) * 100}%`,
                        background: `linear-gradient(90deg, #58a6ff, #f47067)`,
                      }}
                    />
                  </div>
                </div>
                <div className="text-sm text-text-muted font-mono">
                  {area.count}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 relative min-h-0">
        <MapView
          heatmapPoints={heatmapPoints || []}
          heatmapEnabled={heatmapOn}
          heatmapOpacity={heatmapOpacity}
          heatmapIntensity={heatmapIntensity}
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
              onClick={() => setHeatmapOn((v) => !v)}
              className={`relative h-7 w-12 rounded-full transition-colors shrink-0 ${
                heatmapOn ? 'bg-accent' : 'bg-border'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
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
