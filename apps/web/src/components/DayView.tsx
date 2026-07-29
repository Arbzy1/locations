import { useState, useEffect, useCallback, useMemo } from 'react';
import L from 'leaflet';
import { useDayData, useDays } from '../hooks/useApi';
import MapView from './Map';
import Timeline from './Timeline';
import DayCalendar from './DayCalendar';
import { formatDate, formatMiles } from '../utils/format';
import { MODE_COLORS, MODE_LABELS } from '../types';
import type { Visit, Activity, MapFocusTarget } from '../types';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Loader2,
} from 'lucide-react';

function focusTargetForVisit(v: Visit): MapFocusTarget {
  return { lat: v.lat, lon: v.lon, zoom: 16 };
}

function focusTargetForActivity(a: Activity): MapFocusTarget {
  if (a.route_geometry && a.route_geometry.length > 1) {
    const bounds = L.latLngBounds(
      a.route_geometry.map((c) => [c[0], c[1]] as [number, number]),
    );
    return { bounds };
  }
  return {
    bounds: L.latLngBounds([
      [a.start_lat, a.start_lon],
      [a.end_lat, a.end_lon],
    ]),
  };
}

interface Props {
  initialDate?: string;
}

export default function DayView({ initialDate }: Props) {
  const { data: allDays } = useDays();
  const [selectedDate, setSelectedDate] = useState(initialDate || '');
  const [mapFocus, setMapFocus] = useState<MapFocusTarget | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(true);
  const { data: dayData, isLoading, isFetching, progress } = useDayData(selectedDate);

  const handleVisitOnMap = useCallback((v: Visit) => {
    setMapFocus(focusTargetForVisit(v));
  }, []);

  const handleActivityOnMap = useCallback((a: Activity) => {
    setMapFocus(focusTargetForActivity(a));
  }, []);

  const dateList = useMemo(
    () => allDays?.map((d) => d.date) ?? [],
    [allDays],
  );

  useEffect(() => {
    if (initialDate) {
      setSelectedDate(initialDate);
    } else if (!selectedDate && dateList.length) {
      setSelectedDate(dateList[dateList.length - 1]);
    }
  }, [initialDate, dateList]);

  useEffect(() => {
    setMapFocus(null);
  }, [selectedDate]);

  const currentIdx = dateList.indexOf(selectedDate);
  const canPrev = currentIdx > 0;
  const canNext = currentIdx >= 0 && currentIdx < dateList.length - 1;

  const goToPrev = () => {
    if (canPrev) setSelectedDate(dateList[currentIdx - 1]);
  };
  const goToNext = () => {
    if (canNext) setSelectedDate(dateList[currentIdx + 1]);
  };

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-96 shrink-0 flex-col overflow-hidden border-r border-border bg-surface">
        {/* Date Navigation */}
        <div className="shrink-0 border-b border-border p-4">
          <div className="mb-1 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Calendar size={20} className="text-accent" />
              <h2 className="text-lg font-semibold">Day View</h2>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={goToPrev}
                disabled={!canPrev}
                className="rounded border border-border p-1.5 transition-colors duration-ui-fast ease-ui hover:bg-bg disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="Previous day with data"
                title="Go to previous day with data"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={goToNext}
                disabled={!canNext}
                className="rounded border border-border p-1.5 transition-colors duration-ui-fast ease-ui hover:bg-bg disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="Next day with data"
                title="Go to next day with data"
              >
                <ChevronRight size={16} />
              </button>
              <button
                type="button"
                onClick={() => setCalendarOpen((o) => !o)}
                className="rounded border border-border p-1.5 transition-colors duration-ui-fast ease-ui hover:bg-bg"
                aria-expanded={calendarOpen}
                aria-label={calendarOpen ? 'Hide calendar' : 'Show calendar'}
                title={calendarOpen ? 'Hide calendar' : 'Show calendar'}
              >
                <ChevronDown
                  size={16}
                  className={`transition-transform duration-ui-drawer ease-ui-drawer ${
                    calendarOpen ? 'rotate-180' : 'rotate-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {selectedDate && (
            <div className="text-sm text-text-muted">{formatDate(selectedDate)}</div>
          )}

          {allDays && allDays.length > 0 && (
            <div
              className={`grid transition-[grid-template-rows,opacity] duration-ui-drawer ease-ui-drawer ${
                calendarOpen
                  ? 'grid-rows-[1fr] opacity-100'
                  : 'grid-rows-[0fr] opacity-0'
              }`}
            >
              <div className="min-h-0 overflow-hidden">
                <DayCalendar
                  days={allDays}
                  selectedDate={selectedDate}
                  onSelectDate={setSelectedDate}
                />
              </div>
            </div>
          )}
        </div>

        {/* Day Stats */}
        {dayData && !('error' in dayData) && (
          <div className="shrink-0 border-b border-border p-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-lg font-semibold text-accent">
                  {formatMiles(dayData.total_distance_miles)}
                </div>
                <div className="text-xs text-text-muted">Total</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-visit">
                  {dayData.visits.length}
                </div>
                <div className="text-xs text-text-muted">Visits</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-walk">
                  {dayData.activities.length}
                </div>
                <div className="text-xs text-text-muted">Journeys</div>
              </div>
            </div>

            {Object.keys(dayData.modes).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.entries(dayData.modes).map(([mode, count]) => (
                  <span
                    key={mode}
                    className="rounded-full px-2 py-0.5 text-xs"
                    style={{
                      backgroundColor: `${MODE_COLORS[mode] || '#8b949e'}22`,
                      color: MODE_COLORS[mode] || '#8b949e',
                    }}
                  >
                    {MODE_LABELS[mode] || mode} ({count})
                  </span>
                ))}
              </div>
            )}

            {dayData.clusters.length > 0 && (
              <div className="mt-2 text-xs text-text-muted">
                {dayData.clusters.join(' / ')}
              </div>
            )}
          </div>
        )}

        {/* Timeline — min-h-0 so flex child can shrink and scroll */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading || (isFetching && progress) ? (
            <div className="flex flex-col gap-4 p-6">
              <div className="flex items-center gap-3">
                <Loader2 size={22} className="shrink-0 animate-spin text-accent" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="truncate text-sm font-medium text-text">
                      {progress?.stage ?? 'Loading day…'}
                    </div>
                    <div className="shrink-0 font-mono text-sm text-accent">
                      {Math.round(progress?.percent ?? 0)}%
                    </div>
                  </div>
                  {progress?.detail && (
                    <div className="mt-0.5 truncate text-xs text-text-muted">{progress.detail}</div>
                  )}
                </div>
              </div>

              <div className="h-1.5 overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-ui-progress ease-ui"
                  style={{ width: `${Math.min(100, Math.max(0, progress?.percent ?? 0))}%` }}
                />
              </div>

              <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-bg/50 px-3 py-2 font-mono text-[11px] leading-relaxed text-text-muted">
                {(progress?.logs?.length ? progress.logs : ['Waiting for server…']).map(
                  (line, i) => (
                    <div key={`${i}-${line}`} className="truncate">
                      <span className="text-accent/70">›</span> {line}
                    </div>
                  ),
                )}
              </div>
            </div>
          ) : dayData && !('error' in dayData) ? (
            <Timeline
              visits={dayData.visits}
              activities={dayData.activities}
              onVisitClick={handleVisitOnMap}
              onActivityClick={handleActivityOnMap}
            />
          ) : (
            <div className="p-4 text-sm text-text-muted">
              {selectedDate
                ? 'No data for this date'
                : 'Select a date to view'}
            </div>
          )}
        </div>
      </div>

      {/* Map */}
      <div className="min-h-0 flex-1">
        {dayData && !('error' in dayData) ? (
          <MapView
            visits={dayData.visits}
            activities={dayData.activities}
            connectors={dayData.connectors}
            focusTarget={mapFocus}
          />
        ) : (
          <MapView />
        )}
      </div>
    </div>
  );
}
