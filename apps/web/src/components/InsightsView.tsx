import {
  useOverview,
  useMonthlyStats,
  useYearlyStats,
  useFunFacts,
  useCorridors,
  useHomeWork,
  useYearInReview,
  useAreas,
  useMultiDayTrips,
  usePlaceLabels,
  useHeatmap,
} from '../hooks/useApi';
import StatCard from './StatCard';
import MapView from './Map';
import { Button } from './ui/button';
import { MODE_COLORS, MODE_LABELS } from '../types';
import { formatMilesOrKm } from '../utils/format';
import { useUnits } from '../lib/units';
import { useTheme } from '../lib/theme';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import {
  Activity,
  MapPin,
  Calendar,
  TrendingUp,
  Globe,
  Zap,
  ArrowLeftRight,
} from 'lucide-react';

function useChartColors() {
  const { theme } = useTheme();
  return useMemo(() => {
    const s = getComputedStyle(document.documentElement);
    const read = (name: string, fallback: string) =>
      s.getPropertyValue(name).trim() || fallback;
    return {
      muted: read('--text-muted', '#8b949e'),
      surface: read('--surface', '#161b22'),
      border: read('--border', '#30363d'),
      text: read('--text', '#f0f6fc'),
      accent: read('--accent', '#58a6ff'),
    };
  }, [theme]);
}

export default function InsightsView() {
  const { data: overview } = useOverview();
  const { data: monthly } = useMonthlyStats();
  const { data: yearly } = useYearlyStats();
  const { data: facts } = useFunFacts();
  const { data: corridors } = useCorridors();
  const { data: homeWork } = useHomeWork();
  const { data: yearReview } = useYearInReview();
  const { data: areas } = useAreas();
  const { data: multiDay } = useMultiDayTrips();
  const { data: labels } = usePlaceLabels();
  const { data: heatmapPoints } = useHeatmap();
  const { unit } = useUnits();
  const chart = useChartColors();
  const navigate = useNavigate();
  const [mapSize, setMapSize] = useState(0);

  const hiddenKeys = useMemo(
    () => new Set((labels ?? []).filter((l) => l.hidden).map((l) => l.placeKey)),
    [labels],
  );

  const visibleAreas = useMemo(
    () => (areas ?? []).filter((a) => !hiddenKeys.has(a.cluster)),
    [areas, hiddenKeys],
  );

  const visibleCorridors = useMemo(
    () => (corridors ?? []).filter((c) => !hiddenKeys.has(c.from) && !hiddenKeys.has(c.to)),
    [corridors, hiddenKeys],
  );

  const coordByName = useMemo(() => {
    const map = new Map<string, { lat: number; lon: number }>();
    for (const a of visibleAreas) {
      if (Number.isFinite(a.lat) && Number.isFinite(a.lon)) {
        map.set(a.cluster, { lat: a.lat, lon: a.lon });
      }
    }
    for (const p of heatmapPoints ?? []) {
      const name = p.cluster || p.label;
      if (name && !map.has(name) && !hiddenKeys.has(name)) {
        map.set(name, { lat: p.lat, lon: p.lon });
      }
    }
    return map;
  }, [visibleAreas, heatmapPoints, hiddenKeys]);

  const areaMarkers = useMemo(
    () =>
      visibleAreas
        .filter((a) => Number.isFinite(a.lat) && Number.isFinite(a.lon))
        .slice(0, 20)
        .map((a) => ({
          lat: a.lat,
          lon: a.lon,
          label: a.cluster,
          visits: a.visits,
        })),
    [visibleAreas],
  );

  const corridorLines = useMemo(() => {
    const lines: { from: [number, number]; to: [number, number]; count: number }[] = [];
    for (const c of visibleCorridors.slice(0, 12)) {
      const start = coordByName.get(c.from);
      const end = coordByName.get(c.to);
      if (!start || !end) continue;
      lines.push({
        from: [start.lat, start.lon],
        to: [end.lat, end.lon],
        count: c.count,
      });
    }
    return lines;
  }, [visibleCorridors, coordByName]);

  useEffect(() => {
    setMapSize((n) => n + 1);
  }, [areaMarkers.length, corridorLines.length]);

  // Mode breakdown for pie chart
  const modeData = yearly
    ? Object.entries(
        yearly.reduce(
          (acc, y) => {
            for (const [mode, count] of Object.entries(y.modes)) {
              acc[mode] = (acc[mode] || 0) + count;
            }
            return acc;
          },
          {} as Record<string, number>,
        ),
      )
        .map(([mode, count]) => ({
          name: MODE_LABELS[mode] || mode,
          value: count,
          color: MODE_COLORS[mode] || chart.muted,
        }))
        .sort((a, b) => b.value - a.value)
    : [];

  const tooltipStyle = {
    backgroundColor: chart.surface,
    border: `1px solid ${chart.border}`,
    borderRadius: '8px',
    color: chart.text,
  };

  return (
    <div className="h-full overflow-y-auto bg-surface">
      <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <TrendingUp size={22} className="text-accent" />
          Insights
        </h2>

        {/* Overview cards */}
        {overview && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              label="Total Distance"
              value={formatMilesOrKm(overview.total_distance_miles, unit)}
              icon={<Globe size={16} />}
            />
            <StatCard
              label="Days Tracked"
              value={overview.days_with_data.toLocaleString()}
              icon={<Calendar size={16} />}
            />
            <StatCard
              label="Total Visits"
              value={overview.total_visits.toLocaleString()}
              icon={<MapPin size={16} />}
            />
            <StatCard
              label="Total Journeys"
              value={overview.total_activities.toLocaleString()}
              icon={<Activity size={16} />}
            />
            <StatCard
              label="Unique Places"
              value={overview.unique_places.toLocaleString()}
              icon={<MapPin size={16} />}
            />
          </div>
        )}

        {/* Monthly distance chart */}
        {monthly && monthly.length > 0 && (
          <div className="bg-bg border border-border rounded-lg p-4">
            <h3 className="text-sm font-semibold text-text-muted mb-4">
              Monthly Distance
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={monthly}>
                <XAxis
                  dataKey="month"
                  tick={{ fill: chart.muted, fontSize: 10 }}
                  tickFormatter={(v: string) => {
                    const [y, m] = v.split('-');
                    return m === '01' ? y : '';
                  }}
                />
                <YAxis tick={{ fill: chart.muted, fontSize: 11 }} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value) => [
                    `${Math.round(Number(value ?? 0))} mi`,
                    'Distance',
                  ]}
                />
                <Bar dataKey="distance_miles" fill={chart.accent} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[...monthly]
                .slice(-6)
                .reverse()
                .map((m) => {
                  const places = (m.top_places ?? []).filter(([name]) => !hiddenKeys.has(name)).slice(0, 3);
                  if (places.length === 0) return null;
                  return (
                    <div key={m.month} className="rounded-md border border-border/60 bg-surface/40 p-2">
                      <div className="mb-1 text-[11px] font-semibold text-text-muted">{m.month}</div>
                      <ul className="space-y-0.5 text-xs">
                        {places.map(([name, count]) => (
                          <li key={name} className="flex justify-between gap-2">
                            <span className="truncate text-text">{name}</span>
                            <span className="shrink-0 font-mono text-text-muted">{count}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Transport mode pie chart */}
          {modeData.length > 0 && (
            <div className="bg-bg border border-border rounded-lg p-4">
              <h3 className="text-sm font-semibold text-text-muted mb-4">
                Transport Modes
              </h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={modeData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    innerRadius={50}
                    strokeWidth={0}
                  >
                    {modeData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend
                    wrapperStyle={{ color: chart.muted, fontSize: '12px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Top corridors */}
          {visibleCorridors.length > 0 && (
            <div className="bg-bg border border-border rounded-lg p-4">
              <h3 className="text-sm font-semibold text-text-muted mb-4 flex items-center gap-2">
                <ArrowLeftRight size={14} />
                Top Travel Corridors
              </h3>
              <div className="space-y-2">
                {visibleCorridors.slice(0, 10).map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-text truncate">
                        {c.from} ↔ {c.to}
                      </div>
                      <div className="h-1.5 rounded-full bg-surface overflow-hidden mt-1">
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{
                            width: `${(c.count / visibleCorridors[0].count) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                    <span className="text-xs text-text-muted font-mono shrink-0">
                      {c.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Yearly summary */}
        {yearly && yearly.length > 0 && (
          <div className="bg-bg border border-border rounded-lg p-4">
            <h3 className="text-sm font-semibold text-text-muted mb-4">
              Yearly Summary
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-text-muted text-xs border-b border-border">
                    <th className="text-left p-2">Year</th>
                    <th className="text-right p-2">Distance</th>
                    <th className="text-right p-2">Visits</th>
                    <th className="text-right p-2">Journeys</th>
                    <th className="text-right p-2">Days</th>
                  </tr>
                </thead>
                <tbody>
                  {yearly.map((y) => (
                    <tr
                      key={y.year}
                      className="border-b border-border/50 transition-colors duration-ui-emphasis ease-ui hover:bg-surface/50"
                    >
                      <td className="p-2 font-semibold">{y.year}</td>
                      <td className="p-2 text-right text-accent">
                        {formatMilesOrKm(y.distance_miles, unit)}
                      </td>
                      <td className="p-2 text-right">{y.visits.toLocaleString()}</td>
                      <td className="p-2 text-right">
                        {y.activities.toLocaleString()}
                      </td>
                      <td className="p-2 text-right">{y.days_tracked}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {yearReview && yearReview.year && (
          <div className="rounded-lg border border-border bg-bg p-4">
            <h3 className="mb-3 text-sm font-semibold text-text-muted">Year in review · {yearReview.year}</h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Distance" value={formatMilesOrKm(yearReview.distance_miles, unit)} />
              <StatCard label="Visits" value={yearReview.visits.toLocaleString()} />
              <StatCard label="Journeys" value={yearReview.activities.toLocaleString()} />
              <StatCard label="Days" value={String(yearReview.days_tracked)} />
            </div>
            {yearReview.top_places?.some(([name]) => !hiddenKeys.has(name)) && (
              <div className="mt-4">
                <h4 className="mb-2 text-xs font-semibold text-text-muted">Top places</h4>
                <ul className="space-y-1 text-sm">
                  {yearReview.top_places
                    .filter(([name]) => !hiddenKeys.has(name))
                    .slice(0, 8)
                    .map(([name, count]) => (
                      <li key={name} className="flex justify-between gap-2">
                        <span className="truncate">{name}</span>
                        <span className="shrink-0 font-mono text-text-muted">{count}</span>
                      </li>
                    ))}
                </ul>
              </div>
            )}
            {yearReview.modes && Object.keys(yearReview.modes).length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {Object.entries(yearReview.modes)
                  .sort((a, b) => b[1] - a[1])
                  .map(([mode, count]) => (
                    <span
                      key={mode}
                      className="rounded-full border border-border px-2.5 py-1 text-xs"
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
          </div>
        )}

        {homeWork && (homeWork.home || homeWork.work) && (
          <div className="rounded-lg border border-border bg-bg p-4">
            <h3 className="mb-3 text-sm font-semibold text-text-muted">Home and work (guessed)</h3>
            <p className="text-sm text-text">
              Home: {homeWork.home?.cluster ?? 'unknown'}
              {homeWork.home ? ` (${homeWork.home.visits} overnight visits)` : ''}
            </p>
            <p className="mt-1 text-sm text-text">
              Work: {homeWork.work?.cluster ?? 'unknown'}
              {homeWork.work ? ` (${homeWork.work.visits} weekday visits)` : ''}
            </p>
          </div>
        )}

        {visibleAreas.length > 0 && (
          <div className="rounded-lg border border-border bg-bg p-4">
            <h3 className="mb-3 text-sm font-semibold text-text-muted">Frequent areas</h3>
            <ul className="space-y-1 text-sm">
              {visibleAreas.slice(0, 12).map((a) => (
                <li key={a.cluster} className="flex justify-between">
                  <span>{a.cluster}</span>
                  <span className="font-mono text-text-muted">{a.visits}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(areaMarkers.length > 0 || corridorLines.length > 0) && (
          <div className="rounded-lg border border-border bg-bg p-4">
            <h3 className="mb-3 text-sm font-semibold text-text-muted">Areas and corridors</h3>
            <div className="h-64 overflow-hidden rounded-lg border border-border">
              <MapView
                compact
                areaMarkers={areaMarkers}
                corridorLines={corridorLines}
                sizeSignal={mapSize}
              />
            </div>
            <p className="mt-2 text-[11px] text-text-muted">
              Dots are frequent areas. Lines are travel corridors with known endpoints.
            </p>
          </div>
        )}

        {Array.isArray(multiDay) && multiDay.length > 0 && (
          <div className="rounded-lg border border-border bg-bg p-4">
            <h3 className="mb-3 text-sm font-semibold text-text-muted">Multi-day trips</h3>
            <ul className="space-y-1 text-sm">
              {multiDay.slice(0, 12).map((t) => (
                <li key={`${t.start}-${t.end}`}>
                  <Button
                    type="button"
                    variant="ghost"
                    title={`Open Day View for ${t.start}`}
                    className="h-auto min-h-11 w-full justify-start whitespace-normal px-2 py-2 text-left font-normal"
                    onClick={() => void navigate(`/day/${t.start}`)}
                  >
                    {t.start} to {t.end} · {formatMilesOrKm(t.total_miles, unit)} · {t.clusters.slice(0, 4).join(', ')}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Fun facts */}
        {facts && facts.length > 0 && (
          <div className="bg-bg border border-border rounded-lg p-4">
            <h3 className="text-sm font-semibold text-text-muted mb-4 flex items-center gap-2">
              <Zap size={14} />
              Fun Facts
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {facts.map((fact, i) => (
                <StatCard
                  key={i}
                  label={fact.label}
                  value={fact.value}
                  description={fact.description}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
