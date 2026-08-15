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
  useFlights,
  useTrainHops,
  useLowMovementDays,
  useStreaks,
  useCachedAnalytics,
} from '../../hooks/useApi';
import StatCard from '../shell/StatCard';
import MapView from './Map';
import { Button } from '../ui/button';
import { MODE_COLORS, MODE_LABELS } from '../../types';
import { formatMilesOrKm } from '../../utils/format';
import { useUnits } from '../../lib/units';
import { formatFunFact, isGridCluster, multiDayTripLabel } from '../../lib/trips';
import { corridorPath, placePath, tripPath } from '../../lib/paths';
import { downloadElementPng, downloadTextFile, insightsCsv } from '../../lib/insights-export';
import { InsightsStory } from './InsightsStory';
import { isStreaks } from '../../lib/year-review';
import { Link } from 'react-router-dom';
import type { ActivityGuessCount, BadgeSummary, FlightSummary } from '../../types';
import { useTheme } from '../../lib/theme';
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
  Plane,
  TrainFront,
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
  const { data: streaksRaw } = useStreaks();
  const { data: areas } = useAreas();
  const { data: multiDay } = useMultiDayTrips();
  const { data: flights } = useFlights();
  const { data: trainHops } = useTrainHops();
  const { data: lowMovement } = useLowMovementDays();
  const { data: labels } = usePlaceLabels();
  const { data: heatmapPoints } = useHeatmap();
  const { data: badges } = useCachedAnalytics<BadgeSummary>('badges');
  const { data: guesses } = useCachedAnalytics<ActivityGuessCount[]>('activity-guesses');
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

  const namedTrips = useMemo(() => {
    if (!Array.isArray(multiDay)) return [];
    return multiDay
      .map((t) => ({ trip: t, name: multiDayTripLabel(t, hiddenKeys) }))
      .filter((row): row is { trip: typeof multiDay[number]; name: string } => Boolean(row.name))
      .slice(0, 20);
  }, [multiDay, hiddenKeys]);

  const flightSummary = useMemo((): FlightSummary | null => {
    if (!flights || Array.isArray(flights)) return null;
    if (flights.tagged <= 0 && flights.guessed <= 0) return null;
    return flights;
  }, [flights]);

  const visibleTrainHops = useMemo(
    () =>
      (Array.isArray(trainHops) ? trainHops : []).filter(
        (h) =>
          !hiddenKeys.has(h.from) &&
          !hiddenKeys.has(h.to) &&
          !isGridCluster(h.from) &&
          !isGridCluster(h.to),
      ),
    [trainHops, hiddenKeys],
  );

  const visibleLowMovement = useMemo(
    () =>
      (Array.isArray(lowMovement) ? lowMovement : [])
        .map((d) => ({
          ...d,
          clusters: d.clusters.filter((c) => !hiddenKeys.has(c) && !isGridCluster(c)),
        }))
        .filter((d) => d.clusters.length > 0),
    [lowMovement, hiddenKeys],
  );

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
      <div id="insights-export" className="mx-auto max-w-5xl space-y-6 bg-surface p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <TrendingUp size={22} className="text-accent" />
            Insights
          </h2>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              title="Download Insights as CSV"
              onClick={() => {
                const streaks = isStreaks(streaksRaw) ? streaksRaw : null;
                const csv = insightsCsv(yearly, monthly, facts, streaks, {}, unit);
                const day = new Date().toISOString().slice(0, 10);
                downloadTextFile(`locations-insights-${day}.csv`, csv, 'text/csv');
              }}
            >
              CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              title="Download a private PNG of Insights"
              onClick={() =>
                void downloadElementPng(
                  'insights-export',
                  `locations-insights-${new Date().toISOString().slice(0, 10)}.png`,
                )
              }
            >
              PNG
            </Button>
          </div>
        </div>

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

        {badges && !Array.isArray(badges) && (
          <div className="rounded-lg border border-border bg-bg p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-text-muted">Coverage and badges</h3>
              <Button asChild variant="ghost" title="Open badges page">
                <Link to="/badges">All badges</Link>
              </Button>
            </div>
            <p className="text-sm text-text">
              {badges.coveragePercent}% of days in the span have Timeline.
            </p>
            <p className="mt-1 text-xs text-text-muted">
              {(badges.badges ?? []).filter((b) => b.earned).length} earned of {badges.badges?.length ?? 0}
            </p>
          </div>
        )}

        {Array.isArray(guesses) && guesses.length > 0 && (
          <div className="rounded-lg border border-border bg-bg p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-text-muted">Activity guesses</h3>
              <Button asChild variant="ghost" title="Open activity guesses">
                <Link to="/guesses">All guesses</Link>
              </Button>
            </div>
            <ul className="space-y-1 text-sm">
              {guesses.slice(0, 5).map((g) => (
                <li key={g.id} className="flex justify-between gap-2">
                  <span className="text-text">{g.label}</span>
                  <span className="text-text-muted">{g.count}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-text-muted">
              From dwell, hour, and Google place type. Not an LLM.
            </p>
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
                    formatMilesOrKm(Number(value ?? 0), unit),
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
                  <Button
                    key={i}
                    variant="ghost"
                    asChild
                    title={`Open corridor ${c.from} to ${c.to}`}
                    className="h-auto min-h-11 w-full justify-start px-1 font-normal"
                  >
                    <Link to={corridorPath(c.from, c.to)}>
                      <div className="flex w-full items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs text-text">
                            {c.from} ↔ {c.to}
                          </div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface">
                            <div
                              className="h-full rounded-full bg-accent"
                              style={{
                                width: `${(c.count / visibleCorridors[0].count) * 100}%`,
                              }}
                            />
                          </div>
                        </div>
                        <span className="shrink-0 font-mono text-xs text-text-muted">{c.count}</span>
                      </div>
                    </Link>
                  </Button>
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
                    <th className="text-right p-2">Driving</th>
                    <th className="text-right p-2">Transit</th>
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
                      <td className="p-2 text-right text-text-muted">
                        {y.drive_miles != null ? formatMilesOrKm(y.drive_miles, unit) : '-'}
                      </td>
                      <td className="p-2 text-right text-text-muted">
                        {y.transit_miles != null ? formatMilesOrKm(y.transit_miles, unit) : '-'}
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

        <InsightsStory yearly={yearly} monthly={monthly} hiddenKeys={hiddenKeys} chart={chart} />

        {yearReview && yearReview.year && (
          <div className="rounded-lg border border-border bg-bg p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-text-muted">
                Year in review · {yearReview.year}
              </h3>
              <Button
                type="button"
                asChild
                title={`Open ${yearReview.year} review`}
                className="ml-auto h-11"
              >
                <Link to={`/review/${yearReview.year}`}>Open {yearReview.year} review</Link>
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Distance" value={formatMilesOrKm(yearReview.distance_miles, unit)} />
              <StatCard label="Visits" value={yearReview.visits.toLocaleString()} />
              <StatCard label="Journeys" value={yearReview.activities.toLocaleString()} />
              <StatCard label="Days" value={String(yearReview.days_tracked)} />
              {yearReview.drive_miles != null && (
                <StatCard label="Driving" value={formatMilesOrKm(yearReview.drive_miles, unit)} />
              )}
              {yearReview.transit_miles != null && (
                <StatCard label="Transit" value={formatMilesOrKm(yearReview.transit_miles, unit)} />
              )}
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
              Home:{' '}
              {homeWork.home ? (
                <Link className="text-accent" to={placePath(homeWork.home.cluster)} title="Open home guess">
                  {homeWork.home.cluster}
                </Link>
              ) : (
                'unknown'
              )}
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

        {namedTrips.length > 0 && (
          <div className="rounded-lg border border-border bg-bg p-4">
            <h3 className="mb-3 text-sm font-semibold text-text-muted">Multi-day trips</h3>
            <ul className="space-y-1 text-sm">
              {namedTrips.slice(0, 12).map(({ trip: t, name }) => (
                <li key={`${t.start}-${t.end}`}>
                  <Button
                    type="button"
                    variant="ghost"
                    title={`Open trip ${t.start} to ${t.end}`}
                    className="h-auto min-h-11 w-full justify-start whitespace-normal px-2 py-2 text-left font-normal"
                    onClick={() => void navigate(tripPath(t.start, t.end))}
                  >
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="font-medium text-text">{name}</span>
                      <span className="text-text-muted">
                        {t.start} to {t.end} · {formatMilesOrKm(t.total_miles, unit)}
                      </span>
                      {t.modes && t.modes.length > 0 && (
                        <span className="flex flex-wrap gap-1">
                          {t.modes.map((mode) => (
                            <span
                              key={mode}
                              className="rounded-full border px-2 py-0.5 text-[11px]"
                              style={{
                                color: MODE_COLORS[mode] || 'var(--text-muted)',
                                borderColor: MODE_COLORS[mode] || 'var(--border)',
                              }}
                            >
                              {MODE_LABELS[mode] || mode}
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {flightSummary && (
          <div className="rounded-lg border border-border bg-bg p-4">
            <h3 className="mb-2 text-sm font-semibold text-text-muted flex items-center gap-2">
              <Plane size={14} />
              Flights
            </h3>
            <p className="text-sm text-text">
              {flightSummary.tagged} tagged as flying
              {flightSummary.taggedMiles > 0
                ? ` (${formatMilesOrKm(flightSummary.taggedMiles, unit)})`
                : ''}
              {flightSummary.guessed > 0
                ? ` · ${flightSummary.guessed} guessed from distance or speed (${formatMilesOrKm(flightSummary.guessedMiles, unit)})`
                : ''}
            </p>
            <p className="mt-1 text-[11px] text-text-muted">
              Guessed legs are a heuristic (about 400 km or 250 km/h). Timeline flying mode is not overwritten.
            </p>
          </div>
        )}

        {visibleTrainHops.length > 0 && (
          <div className="rounded-lg border border-border bg-bg p-4">
            <h3 className="mb-3 text-sm font-semibold text-text-muted flex items-center gap-2">
              <TrainFront size={14} />
              Train hops (guess)
            </h3>
            <ul className="space-y-1 text-sm">
              {visibleTrainHops.slice(0, 12).map((h) => (
                <li key={`${h.date}-${h.from}-${h.to}`}>
                  <Button
                    type="button"
                    variant="ghost"
                    title={`Open Day View for ${h.date}`}
                    className="h-auto min-h-11 w-full justify-start whitespace-normal px-2 py-2 text-left font-normal"
                    onClick={() => void navigate(`/day/${h.date}`)}
                  >
                    {h.from} to {h.to} · {formatMilesOrKm(h.miles, unit)} · {h.hops} legs · {h.date}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {visibleLowMovement.length > 0 && (
          <div className="rounded-lg border border-border bg-bg p-4">
            <h3 className="mb-2 text-sm font-semibold text-text-muted">Low-movement days</h3>
            <p className="mb-3 text-[11px] text-text-muted">
              Little range and few places. A guess only, not a diagnosis.
            </p>
            <ul className="space-y-1 text-sm">
              {visibleLowMovement.slice(0, 12).map((d) => (
                <li key={d.date}>
                  <Button
                    type="button"
                    variant="ghost"
                    title={`Open Day View for ${d.date}`}
                    className="h-auto min-h-11 w-full justify-start whitespace-normal px-2 py-2 text-left font-normal"
                    onClick={() => void navigate(`/day/${d.date}`)}
                  >
                    {d.date} · {formatMilesOrKm(d.miles, unit)} · {d.clusters.join(', ')}
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
              {facts.map((fact, i) => {
                const formatted = formatFunFact(fact, unit);
                return (
                  <StatCard
                    key={i}
                    label={fact.label}
                    value={formatted.value}
                    description={formatted.description}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
