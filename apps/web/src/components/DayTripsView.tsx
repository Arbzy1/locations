import { useState, useMemo, useRef, useEffect } from 'react';
import { useDayTrips } from '../hooks/useApi';
import { formatDate, formatMiles } from '../utils/format';
import { MODE_COLORS, MODE_LABELS } from '../types';
import type { DayTrip } from '../types';
import {
  Compass,
  Filter,
  MapPin,
  Route,
  ChevronUp,
  ChevronDown,
  X,
} from 'lucide-react';

const ALL_MODES = ['car', 'train', 'bus', 'walking', 'cycling', 'subway', 'flying'] as const;

type SortField = 'date' | 'distance' | 'stops' | 'range';
type SortDir = 'asc' | 'desc';

interface Props {
  onSelectDate: (date: string) => void;
}

export default function DayTripsView({ onSelectDate }: Props) {
  const { data: trips, isLoading } = useDayTrips();
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [minRange, setMinRange] = useState(5);
  const [modeFilter, setModeFilter] = useState<Set<string>>(new Set());
  const [clusterFilter, setClusterFilter] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const listRef = useRef<HTMLDivElement>(null);

  const years = useMemo(() => {
    if (!trips) return [];
    const yrs = [...new Set(trips.map((t) => t.date.slice(0, 4)))];
    return yrs.sort().reverse();
  }, [trips]);

  // Which modes actually appear in the data
  const availableModes = useMemo(() => {
    if (!trips) return [];
    const set = new Set<string>();
    trips.forEach((t) => t.modes.forEach((m) => set.add(m)));
    return ALL_MODES.filter((m) => set.has(m));
  }, [trips]);

  const toggleMode = (mode: string) => {
    setModeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(mode)) next.delete(mode);
      else next.add(mode);
      return next;
    });
  };

  const filtered = useMemo(() => {
    if (!trips) return [];
    return trips.filter((t) => {
      if (yearFilter !== 'all' && !t.date.startsWith(yearFilter)) return false;
      if (t.max_range < minRange) return false;
      if (modeFilter.size > 0 && !t.modes.some((m) => modeFilter.has(m))) return false;
      if (clusterFilter && !t.clusters.some((c) => c.toLowerCase().includes(clusterFilter.toLowerCase()))) return false;
      return true;
    });
  }, [trips, yearFilter, minRange, modeFilter, clusterFilter]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      switch (sortField) {
        case 'date': return dir * a.date.localeCompare(b.date);
        case 'distance': return dir * (a.total_miles - b.total_miles);
        case 'stops': return dir * (a.stops - b.stops);
        case 'range': return dir * (a.max_range - b.max_range);
        default: return 0;
      }
    });
    return list;
  }, [filtered, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'date' ? 'desc' : 'desc');
    }
  };

  const SortBtn = ({ field, label }: { field: SortField; label: string }) => {
    const active = sortField === field;
    return (
      <button
        type="button"
        title={
          active
            ? `Sort by ${label} (${sortDir === 'desc' ? 'descending' : 'ascending'}); click to flip`
            : `Sort day trips by ${label}`
        }
        onClick={() => toggleSort(field)}
        className={`text-xs px-2 py-0.5 rounded transition-colors duration-300 ease-out ${
          active ? 'bg-accent/20 text-accent' : 'text-text-muted hover:text-text hover:bg-bg/50'
        }`}
      >
        {label}
        {active && (sortDir === 'desc' ? <ChevronDown size={10} className="inline ml-0.5" /> : <ChevronUp size={10} className="inline ml-0.5" />)}
      </button>
    );
  };

  // Keyboard nav: up/down arrows scroll through trips
  const [focusIdx, setFocusIdx] = useState(-1);
  useEffect(() => { setFocusIdx(-1); }, [sorted]);

  const activeFilters = (yearFilter !== 'all' ? 1 : 0) + (minRange > 5 ? 1 : 0) + modeFilter.size + (clusterFilter ? 1 : 0);

  return (
    <div className="h-full bg-surface flex flex-col overflow-hidden">
      {/* Header + filters */}
      <div className="p-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <Compass size={20} className="text-accent" />
          <h2 className="text-lg font-semibold">Day Trips</h2>
          <span className="text-text-muted text-sm ml-auto">
            {sorted.length} trips
            {activeFilters > 0 && (
              <button
                type="button"
                title="Clear year, range, mode, and place filters"
                onClick={() => { setYearFilter('all'); setMinRange(5); setModeFilter(new Set()); setClusterFilter(''); }}
                className="ml-2 text-accent transition-colors duration-300 ease-out hover:text-accent/80 text-xs"
              >
                Clear filters
              </button>
            )}
          </span>
        </div>

        {/* Transport mode filter — quick toggle buttons */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {availableModes.map((mode) => {
            const active = modeFilter.has(mode);
            const color = MODE_COLORS[mode] || '#8b949e';
            return (
              <button
                key={mode}
                type="button"
                title={
                  active
                    ? `Remove ${MODE_LABELS[mode] || mode} filter`
                    : `Filter trips that used ${MODE_LABELS[mode] || mode}`
                }
                onClick={() => toggleMode(mode)}
                className="text-xs px-2.5 py-1 rounded-full transition-all duration-300 ease-out font-medium"
                style={{
                  backgroundColor: active ? `${color}33` : `${color}11`,
                  color: active ? color : `${color}88`,
                  border: `1.5px solid ${active ? color : 'transparent'}`,
                }}
              >
                {MODE_LABELS[mode] || mode}
                {active && <X size={10} className="inline ml-1 -mr-0.5" />}
              </button>
            );
          })}
        </div>

        {/* Year + range + place search */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Filter size={12} className="text-text-muted" />
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              title="Filter day trips by year"
              className="bg-bg border border-border rounded px-2 py-1 text-xs text-text"
            >
              <option value="all">All Years</option>
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-text-muted text-xs">Range:</span>
            <input
              type="range"
              min={1}
              max={100}
              value={minRange}
              onChange={(e) => setMinRange(Number(e.target.value))}
              title="Minimum trip range in miles"
              className="w-16"
            />
            <span className="text-text-muted text-xs w-10">{minRange}mi</span>
          </div>

          <input
            type="text"
            placeholder="Search places..."
            value={clusterFilter}
            onChange={(e) => setClusterFilter(e.target.value)}
            title="Filter trips by place name"
            className="bg-bg border border-border rounded px-2 py-1 text-xs text-text flex-1 min-w-0"
          />
        </div>

        {/* Sort */}
        <div className="flex items-center gap-1 mt-2">
          <span className="text-[10px] text-text-muted mr-1">Sort:</span>
          <SortBtn field="date" label="Date" />
          <SortBtn field="distance" label="Distance" />
          <SortBtn field="range" label="Range" />
          <SortBtn field="stops" label="Stops" />
        </div>
      </div>

      {/* Trip list */}
      <div className="flex-1 overflow-y-auto" ref={listRef}>
        {isLoading ? (
          <div className="p-4 text-text-muted text-sm">Loading day trips...</div>
        ) : (
          <div className="p-2 space-y-1.5">
            {sorted.map((trip, idx) => (
              <TripCard
                key={trip.date}
                trip={trip}
                focused={idx === focusIdx}
                modeFilter={modeFilter}
                onSelect={() => onSelectDate(trip.date)}
              />
            ))}

            {sorted.length === 0 && (
              <div className="text-text-muted text-sm p-4 text-center">
                No trips match the current filters.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TripCard({ trip, focused, modeFilter, onSelect }: {
  trip: DayTrip;
  focused: boolean;
  modeFilter: Set<string>;
  onSelect: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focused]);

  // Highlight modes that match the filter
  const highlightedModes = modeFilter.size > 0
    ? trip.modes.filter((m) => modeFilter.has(m))
    : [];

  return (
    <button
      ref={ref}
      onClick={onSelect}
      title={`Open day view for ${formatDate(trip.date)}`}
      className={`w-full text-left bg-bg border rounded-lg p-3 transition-colors duration-300 ease-out ${
        focused ? 'border-accent ring-1 ring-accent/30' : 'border-border hover:border-accent/40'
      }`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-semibold text-text">
          {formatDate(trip.date)}
        </span>
        <span className="text-accent text-sm font-mono font-semibold">
          {formatMiles(trip.total_miles)}
        </span>
      </div>

      {/* Places visited */}
      <div className="text-xs text-text/80 mb-1.5 leading-relaxed">
        {trip.clusters.join(' → ')}
      </div>

      <div className="flex items-center gap-4 text-xs text-text-muted mb-1.5">
        <span className="flex items-center gap-1">
          <MapPin size={11} />
          {trip.stops} stops
        </span>
        <span className="flex items-center gap-1">
          <Route size={11} />
          {trip.journeys} legs
        </span>
        <span>Range: {formatMiles(trip.max_range)}</span>
      </div>

      {/* Mode badges — highlighted if matching filter */}
      {trip.modes.length > 0 && (
        <div className="flex gap-1.5">
          {trip.modes.map((mode) => {
            const color = MODE_COLORS[mode] || '#8b949e';
            const isHighlighted = highlightedModes.includes(mode);
            return (
              <span
                key={mode}
                className="text-[11px] px-1.5 py-0.5 rounded-full font-medium"
                style={{
                  backgroundColor: isHighlighted ? `${color}33` : `${color}15`,
                  color: isHighlighted ? color : `${color}99`,
                  border: isHighlighted ? `1px solid ${color}` : '1px solid transparent',
                }}
              >
                {MODE_LABELS[mode] || mode}
              </span>
            );
          })}
        </div>
      )}
    </button>
  );
}
