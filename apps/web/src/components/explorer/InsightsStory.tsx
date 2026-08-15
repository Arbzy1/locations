import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Flame, Footprints, Sparkles } from 'lucide-react';
import StatCard from '../shell/StatCard';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { EjectField } from '../ui/eject-field';
import {
  useHourOfWeek,
  useLapsedPlaces,
  usePersonality,
  usePlaceDeltas,
  useStreaks,
} from '../../hooks/useApi';
import type { MonthlyStats, PersonalityTag, YearlyStats } from '../../types';
import { MODE_LABELS } from '../../types';
import { formatMilesOrKm, type DistanceUnit } from '../../utils/format';
import { useUnits } from '../../lib/units';
import { useTheme } from '../../lib/theme';
import { currentMonthYm, isStreaks } from '../../lib/explorer/year-review';
import {
  loadDismissedPersonality,
  saveDismissedPersonality,
  visiblePersonality,
} from '../../lib/explorer/personality';
import { WALK_GOAL_KEY, loadWalkGoal, saveWalkGoal, walkProgress, type WalkGoal } from '../../lib/explorer/walk-goal';
import { isGridCluster } from '../../lib/explorer/trips';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MODE_CSS: Record<string, string> = {
  walking: '--walk',
  car: '--car',
  bus: '--bus',
  train: '--train',
  cycling: '--cycle',
  subway: '--train',
  flying: '--fly',
};

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || 'var(--text-muted)';
}

function previousMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return '';
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function InsightsStory({
  yearly,
  monthly,
  hiddenKeys,
  chart,
}: {
  yearly: YearlyStats[] | undefined;
  monthly: MonthlyStats[] | undefined;
  hiddenKeys: Set<string>;
  chart: { muted: string; surface: string; border: string; text: string; accent: string };
}) {
  const { unit, timezone } = useUnits();
  const { theme } = useTheme();
  const { data: streaksRaw } = useStreaks();
  const { data: deltasRaw } = usePlaceDeltas();
  const { data: lapsedRaw } = useLapsedPlaces();
  const { data: hourRaw } = useHourOfWeek();
  const { data: personalityRaw } = usePersonality();
  const streaks = isStreaks(streaksRaw) ? streaksRaw : null;
  const deltas = Array.isArray(deltasRaw) ? deltasRaw : [];
  const lapsed = Array.isArray(lapsedRaw) ? lapsedRaw : [];
  const hourGrid = Array.isArray(hourRaw) && hourRaw.length === 7 ? hourRaw : null;
  const tags = Array.isArray(personalityRaw) ? personalityRaw : [];

  const monthYm = currentMonthYm(timezone);
  const thisDelta = deltas.find((d) => d.month === monthYm);
  const prevYm = previousMonth(monthYm);
  const prevDelta = deltas.find((d) => d.month === prevYm);

  const years = (yearly ?? []).map((y) => y.year);
  const [pickedA, setPickedA] = useState<number | null>(null);
  const [pickedB, setPickedB] = useState<number | null>(null);
  const yearA = pickedA ?? years[years.length - 1] ?? '';
  const yearB = pickedB ?? years[Math.max(0, years.length - 2)] ?? years[0] ?? '';

  const rowA = yearly?.find((y) => y.year === yearA);
  const rowB = yearly?.find((y) => y.year === yearB);

  const areaData = useMemo(() => {
    return (yearly ?? []).map((y) => {
      const row: Record<string, number> = { year: y.year };
      const source = y.mode_miles && Object.keys(y.mode_miles).length ? y.mode_miles : y.modes;
      for (const [mode, n] of Object.entries(source)) row[mode] = n;
      return row;
    });
  }, [yearly]);
  const areaModes = useMemo(() => {
    const set = new Set<string>();
    for (const row of areaData) {
      for (const k of Object.keys(row)) if (k !== 'year') set.add(k);
    }
    return [...set];
  }, [areaData]);

  const walkMiles = monthly?.find((m) => m.month === monthYm)?.mode_miles?.walking ?? 0;
  void theme;

  return (
    <>
      {streaks && (
        <div className="rounded-lg border border-border bg-bg p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-muted">
            <Flame size={14} />
            Streaks
          </h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <StatCard label="Current streak" value={`${streaks.current} days`} />
            <StatCard label="Longest streak" value={`${streaks.longest} days`} />
            <StatCard label="Longest gap" value={`${streaks.longestGap} days`} />
          </div>
        </div>
      )}

      {(thisDelta || prevDelta) && (
        <div className="rounded-lg border border-border bg-bg p-4">
          <h3 className="mb-3 text-sm font-semibold text-text-muted">New places this month vs last</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <PlaceDeltaCol
              title={monthYm}
              clusters={(thisDelta?.newClusters ?? []).filter((c) => !hiddenKeys.has(c) && !isGridCluster(c))}
            />
            <PlaceDeltaCol
              title={prevYm || 'Previous'}
              clusters={(prevDelta?.newClusters ?? []).filter((c) => !hiddenKeys.has(c) && !isGridCluster(c))}
            />
          </div>
        </div>
      )}

      {lapsed.some((p) => !hiddenKeys.has(p.cluster) && !isGridCluster(p.cluster)) && (
        <div className="rounded-lg border border-border bg-bg p-4">
          <h3 className="mb-3 text-sm font-semibold text-text-muted">Places you have not been to lately</h3>
          <ul className="space-y-1 text-sm">
            {lapsed
              .filter((p) => !hiddenKeys.has(p.cluster) && !isGridCluster(p.cluster))
              .slice(0, 8)
              .map((p) => (
                <li key={p.cluster} className="flex justify-between gap-2">
                  <span className="truncate">
                    You have not been to {p.cluster} in {p.years} year{p.years === 1 ? '' : 's'}
                  </span>
                  <span className="shrink-0 font-mono text-text-muted">{p.lastDate}</span>
                </li>
              ))}
          </ul>
        </div>
      )}

      {years.length >= 1 && (
        <div className="rounded-lg border border-border bg-bg p-4">
          <h3 className="mb-3 text-sm font-semibold text-text-muted">Compare two years</h3>
          <div className="mb-3 flex flex-wrap gap-2">
            <EjectField label="First year" htmlFor="compare-year-a">
              <select
                id="compare-year-a"
                title="First year to compare"
                className="h-11 rounded-lg border border-border bg-bg px-3 text-sm text-text"
                value={yearA}
                onChange={(e) => setPickedA(Number(e.target.value))}
              >
                {years.map((y) => (
                  <option key={`a-${y}`} value={y}>{y}</option>
                ))}
              </select>
            </EjectField>
            <EjectField label="Second year" htmlFor="compare-year-b">
              <select
                id="compare-year-b"
                title="Second year to compare"
                className="h-11 rounded-lg border border-border bg-bg px-3 text-sm text-text"
                value={yearB}
                onChange={(e) => setPickedB(Number(e.target.value))}
              >
                {years.map((y) => (
                  <option key={`b-${y}`} value={y}>{y}</option>
                ))}
              </select>
            </EjectField>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <YearCompareCard row={rowA} unit={unit} />
            <YearCompareCard row={rowB} unit={unit} />
          </div>
        </div>
      )}

      {areaData.length > 0 && areaModes.length > 0 && (
        <div className="rounded-lg border border-border bg-bg p-4">
          <h3 className="mb-4 text-sm font-semibold text-text-muted">Modes by year</h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={areaData}>
              <XAxis dataKey="year" tick={{ fill: chart.muted, fontSize: 11 }} />
              <YAxis tick={{ fill: chart.muted, fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: chart.surface,
                  border: `1px solid ${chart.border}`,
                  borderRadius: '8px',
                  color: chart.text,
                }}
              />
              {areaModes.map((mode) => (
                <Area
                  key={mode}
                  type="monotone"
                  dataKey={mode}
                  stackId="modes"
                  stroke={cssVar(MODE_CSS[mode] || '--text-muted')}
                  fill={cssVar(MODE_CSS[mode] || '--text-muted')}
                  fillOpacity={0.55}
                  name={MODE_LABELS[mode] || mode}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {hourGrid && <HourHeatmap grid={hourGrid} accent={chart.accent} />}
      <PersonalityBlock tags={tags} />
      <WalkGoalCard walkedMiles={walkMiles} unit={unit} monthYm={monthYm} />
    </>
  );
}

function PlaceDeltaCol({ title, clusters }: { title: string; clusters: string[] }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold text-text-muted">{title}</div>
      {clusters.length === 0 ? (
        <p className="text-sm text-text-muted">No new places</p>
      ) : (
        <ul className="space-y-0.5 text-sm">
          {clusters.slice(0, 8).map((c) => (
            <li key={c} className="truncate">{c}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function YearCompareCard({ row, unit }: { row?: YearlyStats; unit: DistanceUnit }) {
  if (!row) return <p className="text-sm text-text-muted">No data</p>;
  const mix = Object.entries(row.modes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([mode, n]) => `${MODE_LABELS[mode] || mode} ${n}`)
    .join(', ');
  return (
    <div className="rounded-md border border-border/60 p-3">
      <div className="mb-2 font-semibold">{row.year}</div>
      <p className="text-sm">Distance: {formatMilesOrKm(row.distance_miles, unit)}</p>
      <p className="text-sm">Days: {row.days_tracked}</p>
      <p className="text-sm">Visits: {row.visits.toLocaleString()}</p>
      <p className="mt-1 text-xs text-text-muted">{mix || 'No mode mix'}</p>
    </div>
  );
}

function HourHeatmap({ grid, accent }: { grid: number[][]; accent: string }) {
  const max = Math.max(1, ...grid.flat());
  return (
    <div className="rounded-lg border border-border bg-bg p-4">
      <h3 className="mb-3 text-sm font-semibold text-text-muted">Hour of week</h3>
      <div className="overflow-x-auto">
        <div className="grid min-w-[36rem] grid-cols-[2.5rem_repeat(24,minmax(0,1fr))] gap-0.5">
          <div />
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="text-center text-[9px] text-text-muted">{h}</div>
          ))}
          {grid.map((row, d) => (
            <div key={d} className="contents">
              <div className="text-[10px] text-text-muted">{WEEKDAYS[d]}</div>
              {row.map((n, h) => {
                const t = n / max;
                return (
                  <div
                    key={`${d}-${h}`}
                    title={`${WEEKDAYS[d]} ${h}:00 · ${n} visits`}
                    className="h-4 rounded-sm"
                    style={{ backgroundColor: accent, opacity: n === 0 ? 0.08 : 0.15 + t * 0.85 }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PersonalityBlock({ tags }: { tags: PersonalityTag[] }) {
  const [dismissed, setDismissed] = useState<string[]>(() =>
    typeof localStorage === 'undefined' ? [] : loadDismissedPersonality(),
  );
  const visible = visiblePersonality(tags, dismissed);
  if (!tags.length) return null;
  return (
    <div className="space-y-3">
      {visible.map((tag) => (
        <div key={tag.id} className="rounded-lg border border-border bg-bg p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
              <Sparkles size={14} className="text-accent" />
              {labelForTag(tag.id)}
            </h3>
            <Button
              type="button"
              variant="ghost"
              title="Hide this personality card"
              className="h-11"
              onClick={() => {
                const next = [...dismissed, tag.id];
                setDismissed(next);
                saveDismissedPersonality(next);
              }}
            >
              Hide
            </Button>
          </div>
          <p className="text-sm text-text-muted">{tag.reason}</p>
        </div>
      ))}
      {dismissed.length > 0 && (
        <Button
          type="button"
          variant="outline"
          title="Show personality cards"
          className="h-11"
          onClick={() => {
            setDismissed([]);
            saveDismissedPersonality([]);
          }}
        >
          Show personality cards
        </Button>
      )}
    </div>
  );
}

function labelForTag(id: PersonalityTag['id']): string {
  if (id === 'walker') return 'Walker';
  if (id === 'flyer') return 'Flyer';
  return 'Creature of habit';
}

function WalkGoalCard({
  walkedMiles,
  unit,
  monthYm,
}: {
  walkedMiles: number;
  unit: DistanceUnit;
  monthYm: string;
}) {
  const [goal, setGoal] = useState<WalkGoal | null>(() =>
    typeof localStorage === 'undefined' ? null : loadWalkGoal(),
  );
  const [targetInput, setTargetInput] = useState(goal?.target ? String(goal.target) : '20');
  const active: WalkGoal =
    goal && goal.month === monthYm
      ? goal
      : { month: monthYm, target: Number(targetInput) || 20, unit };
  const progress = walkProgress(unit === 'km' ? walkedMiles / 0.621371 : walkedMiles, active.target);

  return (
    <div className="rounded-lg border border-border bg-bg p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-muted">
        <Footprints size={14} />
        Walk goal this month
      </h3>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <EjectField label={`Target (${unit})`} htmlFor="walk-goal" className="w-28">
          <Input
            id="walk-goal"
            title="Monthly walking target"
            inputMode="decimal"
            value={targetInput}
            onChange={(e) => setTargetInput(e.target.value)}
          />
        </EjectField>
        <Button
          type="button"
          title="Save walk goal on this device"
          onClick={() => {
            const target = Number(targetInput);
            if (!Number.isFinite(target) || target <= 0) return;
            const next = { month: monthYm, target, unit };
            setGoal(next);
            saveWalkGoal(next);
          }}
        >
          Save
        </Button>
        <Button
          type="button"
          variant="outline"
          title="Reset walk goal on this device"
          onClick={() => {
            setGoal(null);
            localStorage.removeItem(WALK_GOAL_KEY);
            setTargetInput('20');
          }}
        >
          Reset
        </Button>
      </div>
      <p className="mb-2 text-sm text-text">
        {formatMilesOrKm(walkedMiles, unit)} of {active.target} {unit}
      </p>
      <div className="h-3 overflow-hidden rounded-full bg-surface">
        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
    </div>
  );
}
