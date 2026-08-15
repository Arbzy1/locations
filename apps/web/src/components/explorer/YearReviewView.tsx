import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useMemo } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import StatCard from './StatCard';
import { Button } from './ui/button';
import { usePlaceLabels, useYearReview, useYearlyStats } from '../hooks/useApi';
import { formatMilesOrKm } from '../utils/format';
import { useUnits } from '../lib/units';
import { MODE_COLORS, MODE_LABELS } from '../types';
import type { MultiDayTrip } from '../types';
import { enterMotion } from '../lib/motion';
import { downloadElementPng } from '../lib/insights-export';
import { isGridCluster, multiDayTripLabel } from '../lib/trips';

export default function YearReviewView() {
  const { year: yearParam } = useParams();
  const { data: yearly = [] } = useYearlyStats();
  const { data: labels } = usePlaceLabels();
  const { unit } = useUnits();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const enter = reduce ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.08 } } : enterMotion;

  const years = useMemo(
    () => [...yearly].map((y) => y.year).sort((a, b) => a - b),
    [yearly],
  );
  const latest = years[years.length - 1];
  const parsed = Number(yearParam);
  const year = Number.isFinite(parsed) ? parsed : latest;

  const hiddenKeys = useMemo(
    () => new Set((labels ?? []).filter((l) => l.hidden).map((l) => l.placeKey)),
    [labels],
  );

  const { data, isLoading } = useYearReview(year);
  const chapter = data && data.year === year ? data : null;

  if (!yearParam || !Number.isFinite(parsed) || (years.length > 0 && year != null && !years.includes(year))) {
    if (latest) return <Navigate to={`/review/${latest}`} replace />;
  }

  const idx = years.indexOf(year ?? -1);
  const prevYear = idx > 0 ? years[idx - 1] : null;
  const nextYear = idx >= 0 && idx < years.length - 1 ? years[idx + 1] : null;

  const places = (chapter?.top_places ?? []).filter(([name]) => !hiddenKeys.has(name) && !isGridCluster(name));
  const firsts = (chapter?.firsts ?? []).filter((f) => !hiddenKeys.has(f.cluster) && !isGridCluster(f.cluster));
  const trips = (chapter?.trips ?? [])
    .map((t) => ({ trip: t, name: multiDayTripLabel(t, hiddenKeys) }))
    .filter((row): row is { trip: MultiDayTrip; name: string } => Boolean(row.name));

  return (
    <div className="h-full overflow-y-auto bg-surface">
      <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" asChild title="Back to Insights" className="h-11">
            <Link to="/insights">
              <ArrowLeft size={16} />
              Insights
            </Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            title="Previous year"
            aria-label="Previous year"
            disabled={!prevYear}
            onClick={() => prevYear && void navigate(`/review/${prevYear}`)}
          >
            <ChevronLeft size={16} />
          </Button>
          <h2 className="flex-1 text-center text-xl font-semibold text-text">{year} review</h2>
          <Button
            type="button"
            variant="outline"
            title="Next year"
            aria-label="Next year"
            disabled={!nextYear}
            onClick={() => nextYear && void navigate(`/review/${nextYear}`)}
          >
            <ChevronRight size={16} />
          </Button>
          <Button
            type="button"
            variant="outline"
            title="Download a private PNG of this review"
            aria-label="Download PNG"
            onClick={() => void downloadElementPng('year-review-export', `locations-review-${year}.png`)}
          >
            <Download size={16} />
            PNG
          </Button>
        </div>

        {isLoading && <p className="text-sm text-text-muted">Loading this year…</p>}
        {!isLoading && !chapter && (
          <p className="text-sm text-text-muted">No review for this year yet. Import Timeline data, then open Insights.</p>
        )}

        {chapter && (
          <div id="year-review-export" className="space-y-6 bg-surface">
            <AnimatePresence>
              <motion.section key="totals" {...enter} className="rounded-lg border border-border bg-bg p-4">
                <h3 className="mb-3 text-sm font-semibold text-text-muted">Totals</h3>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <StatCard label="Distance" value={formatMilesOrKm(chapter.distance_miles, unit)} />
                  <StatCard label="Visits" value={chapter.visits.toLocaleString()} />
                  <StatCard label="Journeys" value={chapter.activities.toLocaleString()} />
                  <StatCard label="Days" value={String(chapter.days_tracked)} />
                </div>
              </motion.section>

              {places.length > 0 && (
                <motion.section key="places" {...enter} className="rounded-lg border border-border bg-bg p-4">
                  <h3 className="mb-3 text-sm font-semibold text-text-muted">Places</h3>
                  <ul className="space-y-1 text-sm">
                    {places.slice(0, 12).map(([name, count]) => (
                      <li key={name} className="flex justify-between gap-2">
                        <span className="truncate">{name}</span>
                        <span className="shrink-0 font-mono text-text-muted">{count}</span>
                      </li>
                    ))}
                  </ul>
                </motion.section>
              )}

              {chapter.modes && Object.keys(chapter.modes).length > 0 && (
                <motion.section key="modes" {...enter} className="rounded-lg border border-border bg-bg p-4">
                  <h3 className="mb-3 text-sm font-semibold text-text-muted">Modes</h3>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(chapter.modes)
                      .sort((a, b) => b[1] - a[1])
                      .map(([mode, count]) => (
                        <span
                          key={mode}
                          className="rounded-full border px-2.5 py-1 text-xs"
                          style={{
                            color: MODE_COLORS[mode] || 'var(--text-muted)',
                            borderColor: MODE_COLORS[mode] || 'var(--border)',
                          }}
                        >
                          {MODE_LABELS[mode] || mode} · {count}
                        </span>
                      ))}
                  </div>
                </motion.section>
              )}

              {trips.length > 0 && (
                <motion.section key="trips" {...enter} className="rounded-lg border border-border bg-bg p-4">
                  <h3 className="mb-3 text-sm font-semibold text-text-muted">Trips</h3>
                  <ul className="space-y-1">
                    {trips.slice(0, 16).map(({ trip, name }) => (
                      <li key={`${trip.start}-${trip.end}`}>
                        <Button
                          type="button"
                          variant="ghost"
                          title={`Open Day View for ${trip.start}`}
                          className="h-auto min-h-11 w-full justify-start whitespace-normal px-2 py-2 text-left font-normal"
                          onClick={() => void navigate(`/day/${trip.start}`)}
                        >
                          {name} · {trip.start} to {trip.end} · {formatMilesOrKm(trip.total_miles, unit)}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </motion.section>
              )}

              {firsts.length > 0 && (
                <motion.section key="firsts" {...enter} className="rounded-lg border border-border bg-bg p-4">
                  <h3 className="mb-3 text-sm font-semibold text-text-muted">Firsts</h3>
                  <ul className="space-y-1 text-sm">
                    {firsts.slice(0, 16).map((f) => (
                      <li key={`${f.cluster}-${f.date}`} className="flex justify-between gap-2">
                        <span className="truncate">{f.cluster}</span>
                        <span className="shrink-0 font-mono text-text-muted">{f.date}</span>
                      </li>
                    ))}
                  </ul>
                </motion.section>
              )}

              {chapter.streaks && (
                <motion.section key="streaks" {...enter} className="rounded-lg border border-border bg-bg p-4">
                  <h3 className="mb-3 text-sm font-semibold text-text-muted">Streaks</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <StatCard label="Longest streak" value={`${chapter.streaks.longest} days`} />
                    <StatCard label="Ending streak" value={`${chapter.streaks.current} days`} />
                  </div>
                </motion.section>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
