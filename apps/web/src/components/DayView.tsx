import { useState, useEffect, useCallback } from 'react';
import L from 'leaflet';
import { useDayData, useDays } from '../hooks/useApi';
import MapView from './Map';
import Timeline from './Timeline';
import { formatDate, formatMiles } from '../utils/format';
import { MODE_COLORS, MODE_LABELS } from '../types';
import type { Visit, Activity, MapFocusTarget } from '../types';
import {
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
  const { data: dayData, isLoading } = useDayData(selectedDate);

  const handleVisitOnMap = useCallback((v: Visit) => {
    setMapFocus(focusTargetForVisit(v));
  }, []);

  const handleActivityOnMap = useCallback((a: Activity) => {
    setMapFocus(focusTargetForActivity(a));
  }, []);

  useEffect(() => {
    if (initialDate) {
      setSelectedDate(initialDate);
    } else if (!selectedDate && allDays?.length) {
      setSelectedDate(allDays[allDays.length - 1]);
    }
  }, [initialDate, allDays]);

  useEffect(() => {
    setMapFocus(null);
  }, [selectedDate]);

  const currentIdx = allDays?.indexOf(selectedDate) ?? -1;
  const canPrev = currentIdx > 0;
  const canNext = allDays ? currentIdx < allDays.length - 1 : false;

  const goToPrev = () => {
    if (canPrev && allDays) setSelectedDate(allDays[currentIdx - 1]);
  };
  const goToNext = () => {
    if (canNext && allDays) setSelectedDate(allDays[currentIdx + 1]);
  };

  return (
    <div className="flex h-full">
      <div className="w-96 shrink-0 bg-surface border-r border-border flex flex-col overflow-hidden">
        {/* Date Navigation */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 mb-3">
            <Calendar size={20} className="text-accent" />
            <h2 className="text-lg font-semibold">Day View</h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={goToPrev}
              disabled={!canPrev}
              className="p-1.5 rounded border border-border hover:bg-bg disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={16} />
            </button>

            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="flex-1 bg-bg border border-border rounded px-3 py-1.5 text-sm text-text"
            />

            <button
              onClick={goToNext}
              disabled={!canNext}
              className="p-1.5 rounded border border-border hover:bg-bg disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {selectedDate && (
            <div className="text-text-muted text-sm mt-2">
              {formatDate(selectedDate)}
            </div>
          )}
        </div>

        {/* Day Stats */}
        {dayData && !('error' in dayData) && (
          <div className="p-4 border-b border-border">
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
              <div className="flex flex-wrap gap-2 mt-3">
                {Object.entries(dayData.modes).map(([mode, count]) => (
                  <span
                    key={mode}
                    className="text-xs px-2 py-0.5 rounded-full"
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
              <div className="text-xs text-text-muted mt-2">
                {dayData.clusters.join(' / ')}
              </div>
            )}
          </div>
        )}

        {/* Timeline */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 size={24} className="animate-spin text-accent" />
            </div>
          ) : dayData && !('error' in dayData) ? (
            <Timeline
              visits={dayData.visits}
              activities={dayData.activities}
              onVisitClick={handleVisitOnMap}
              onActivityClick={handleActivityOnMap}
            />
          ) : (
            <div className="p-4 text-text-muted text-sm">
              {selectedDate
                ? 'No data for this date'
                : 'Select a date to view'}
            </div>
          )}
        </div>
      </div>

      {/* Map */}
      <div className="flex-1">
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
