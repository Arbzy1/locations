import { useState, useMemo, useRef } from 'react';
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

function SortBtn({
  field,
  label,
  sortField,
  sortDir,
  onToggle,
}: {
  field: SortField;
  label: string;
  sortField: SortField;
  sortDir: SortDir;
  onToggle: (field: SortField) => void;
}) {
  const active = sortField === field;
  return (
    <button
      type="button"
      title={
        active
          ? `Sort by ${label} (${sortDir === 'desc' ? 'descending' : 'ascending'}); click to flip`
          : `Sort day trips by ${label}`
      }
      onClick={() => onToggle(field)}
      className={`min-h-11 rounded px-3 py-2 text-xs transition-colors duration-ui-fast ease-ui ${
        active ? 'bg-accent/20 text-accent' : 'text-text-muted hover:bg-bg/50 hover:text-text'
      }`}
    >
      {label}
      {active &&
        (sortDir === 'desc' ? (
          <ChevronDown size={10} className="ml-0.5 inline" />
        ) : (
          <ChevronUp size={10} className="ml-0.5 inline" />
        ))}
    </button>
  );
}

export default function DayTripsView({ onSelectDate }: Props) {
  const { data: trips, isLoading } = useDayTrips();
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [minRange, setMinRange] = useState(5);
  const [modeFilter, setModeFilter] = useState<Set<string>>(new Set());
  const [clusterFilter, setClusterFilter] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const years = useMemo(() => {
    if (!trips) return [];
    const yrs = [...new Set(trips.map((t) => t.date.slice(0, 4)))];
    return yrs.sort().reverse();
  }, [trips]);

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
      setSortDir('desc');
    }
  };

  const activeFilters = (yearFilter !== 'all' ? 1 : 0) + (minRange > 5 ? 1 : 0) + modeFilter.size + (clusterFilter ? 1 : 0);

  const filterControls = (
    <>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {availableModes.map((mode) => {
          const active = modeFilter.has(mode);
          const color = MODE_COLORS[mode] || 'var(--text-muted)';
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
              className="min-h-11 rounded-full px-3 py-2 text-xs font-medium transition-all duration-ui-fast ease-ui"
              style={{
                backgroundColor: active ? `${color}33` : `${color}11`,
                color: active ? color : `${color}88`,
                border: `1.5px solid ${active ? color : 'transparent'}`,
              }}
            >
              {MODE_LABELS[mode] || mode}
              {active && <X size={10} className="-mr-0.5 ml-1 inline" />}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-h-11 items-center gap-1.5">
          <Filter size={12} className="text-text-muted" />
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            title="Filter day trips by year"
            className="min-h-11 rounded border border-border bg-bg px-2 py-1 text-xs text-text"
          >
            <option value="all">All Years</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        <div className="flex min-h-11 items-center gap-1.5">
          <span className="text-xs text-text-muted">Range:</span>
          <input
            type="range"
            min={1}
            max={100}
            value={minRange}
            onChange={(e) => setMinRange(Number(e.target.value))}
            title="Minimum trip range in miles"
            className="w-20"
          />
          <span className="w-10 text-xs text-text-muted">{minRange}mi</span>
        </div>

        <input
          type="text"
          placeholder="Search places..."
          value={clusterFilter}
          onChange={(e) => setClusterFilter(e.target.value)}
          title="Filter trips by place name"
          className="min-h-11 min-w-0 flex-1 rounded border border-border bg-bg px-2 py-1 text-xs text-text"
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1">
        <span className="mr-1 text-[10px] text-text-muted">Sort:</span>
        <SortBtn field="date" label="Date" sortField={sortField} sortDir={sortDir} onToggle={toggleSort} />
        <SortBtn field="distance" label="Distance" sortField={sortField} sortDir={sortDir} onToggle={toggleSort} />
        <SortBtn field="range" label="Range" sortField={sortField} sortDir={sortDir} onToggle={toggleSort} />
        <SortBtn field="stops" label="Stops" sortField={sortField} sortDir={sortDir} onToggle={toggleSort} />
      </div>
    </>
  );

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface">
      <div className="shrink-0 border-b border-border p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Compass size={20} className="text-accent" />
          <h2 className="text-lg font-semibold">Day Trips</h2>
          <span className="ml-auto text-sm text-text-muted">
            {sorted.length} trips
            {activeFilters > 0 && (
              <button
                type="button"
                title="Clear year, range, mode, and place filters"
                onClick={() => { setYearFilter('all'); setMinRange(5); setModeFilter(new Set()); setClusterFilter(''); }}
                className="ml-2 text-xs text-accent transition-colors duration-ui-fast ease-ui hover:text-accent/80"
              >
                Clear filters
              </button>
            )}
          </span>
          <button
            type="button"
            title={filtersOpen ? 'Hide filters' : 'Show filters'}
            aria-expanded={filtersOpen}
            aria-label={filtersOpen ? 'Hide filters' : 'Show filters'}
            onClick={() => setFiltersOpen((v) => !v)}
            className="flex h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-text-muted transition-colors duration-ui-hover ease-ui hover:bg-bg/50 hover:text-text lg:hidden"
          >
            <Filter size={14} />
            Filters
            {activeFilters > 0 && (
              <span className="rounded-full bg-accent/20 px-1.5 py-0.5 font-mono text-accent">
                {activeFilters}
              </span>
            )}
            <ChevronDown
              size={14}
              className={`transition-transform duration-ui-enter ease-ui ${filtersOpen ? 'rotate-180' : ''}`}
            />
          </button>
        </div>

        <div className="hidden lg:block">{filterControls}</div>
        <div
          className={`grid transition-[grid-template-rows,opacity] duration-ui-enter ease-ui lg:hidden ${
            filtersOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          }`}
        >
          <div className="min-h-0 overflow-hidden">{filterControls}</div>
        </div>
      </div>

      {/* Trip list */}
      <div className="flex-1 overflow-y-auto" ref={listRef}>
        {isLoading ? (
          <div className="p-4 text-text-muted text-sm">Loading day trips...</div>
        ) : (
          <div className="p-2 space-y-1.5">
            {sorted.map((trip) => (
              <TripCard
                key={trip.date}
                trip={trip}
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

function TripCard({ trip, modeFilter, onSelect }: {
  trip: DayTrip;
  modeFilter: Set<string>;
  onSelect: () => void;
}) {
  const highlightedModes = modeFilter.size > 0
    ? trip.modes.filter((m) => modeFilter.has(m))
    : [];

  return (
    <button
      type="button"
      onClick={onSelect}
      title={`Open day view for ${formatDate(trip.date)}`}
      className="w-full rounded-lg border border-border bg-bg p-3 text-left transition-colors duration-ui-emphasis ease-ui hover:border-accent/40"
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

      {/* Mode badges: highlighted if matching filter */}
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
