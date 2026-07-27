import {
  useOverview,
  useMonthlyStats,
  useYearlyStats,
  useFunFacts,
  useCorridors,
} from '../hooks/useApi';
import StatCard from './StatCard';
import { MODE_COLORS, MODE_LABELS } from '../types';
import { formatMiles } from '../utils/format';
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

export default function InsightsView() {
  const { data: overview } = useOverview();
  const { data: monthly } = useMonthlyStats();
  const { data: yearly } = useYearlyStats();
  const { data: facts } = useFunFacts();
  const { data: corridors } = useCorridors();

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
          color: MODE_COLORS[mode] || '#8b949e',
        }))
        .sort((a, b) => b.value - a.value)
    : [];

  return (
    <div className="h-full bg-surface overflow-y-auto">
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <TrendingUp size={22} className="text-accent" />
          Insights
        </h2>

        {/* Overview cards */}
        {overview && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              label="Total Distance"
              value={formatMiles(overview.total_distance_miles)}
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
          </div>
        )}

        {/* Monthly distance chart */}
        {monthly && monthly.length > 0 && (
          <div className="bg-bg border border-border rounded-lg p-4">
            <h3 className="text-sm font-semibold text-text-muted mb-4">
              Monthly Distance (miles)
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={monthly}>
                <XAxis
                  dataKey="month"
                  tick={{ fill: '#8b949e', fontSize: 10 }}
                  tickFormatter={(v: string) => {
                    const [y, m] = v.split('-');
                    return m === '01' ? y : '';
                  }}
                />
                <YAxis tick={{ fill: '#8b949e', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#161b22',
                    border: '1px solid #30363d',
                    borderRadius: '8px',
                    color: '#f0f6fc',
                  }}
                  formatter={(value) => [
                    `${Math.round(Number(value ?? 0))} mi`,
                    'Distance',
                  ]}
                />
                <Bar dataKey="distance_miles" fill="#58a6ff" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
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
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#161b22',
                      border: '1px solid #30363d',
                      borderRadius: '8px',
                      color: '#f0f6fc',
                    }}
                  />
                  <Legend
                    wrapperStyle={{ color: '#8b949e', fontSize: '12px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Top corridors */}
          {corridors && corridors.length > 0 && (
            <div className="bg-bg border border-border rounded-lg p-4">
              <h3 className="text-sm font-semibold text-text-muted mb-4 flex items-center gap-2">
                <ArrowLeftRight size={14} />
                Top Travel Corridors
              </h3>
              <div className="space-y-2">
                {corridors.slice(0, 10).map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-text truncate">
                        {c.from} ↔ {c.to}
                      </div>
                      <div className="h-1.5 rounded-full bg-surface overflow-hidden mt-1">
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{
                            width: `${(c.count / corridors[0].count) * 100}%`,
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
                      className="border-b border-border/50 hover:bg-surface/50"
                    >
                      <td className="p-2 font-semibold">{y.year}</td>
                      <td className="p-2 text-right text-accent">
                        {formatMiles(y.distance_miles)}
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
