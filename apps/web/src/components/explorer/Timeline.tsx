import { useState } from 'react';
import type { Visit, Activity, Connector } from '../../types';
import { MODE_LABELS } from '../../types';
import { formatTime, formatDuration, formatDistance } from '../../utils/format';
import { useUnits } from '../../lib/units';
import {
  continuesPastDate,
  startedBeforeDate,
  UNKNOWN_MOVEMENT_HINT,
} from '../../lib/explorer/dayPlayback';
import { cn } from '../../lib/utils';
import {
  MapPin,
  Footprints,
  Car,
  Bus,
  Train,
  Bike,
  Plane,
  CircleDot,
  HelpCircle,
  ChevronDown,
  ChevronRight,
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  ArrowDown,
  RotateCw,
  Navigation,
  GitFork,
  LogIn,
  LogOut,
  CornerDownRight,
  Clock,
} from 'lucide-react';

// Chronological palette (same as Map.tsx)
const JOURNEY_PALETTE = [
  '#58a6ff', '#56d4dd', '#3fb950', '#56d364', '#a3d977',
  '#d29922', '#e8a030', '#f47067', '#f778ba', '#bc8cff',
  '#79c0ff', '#a5d6ff',
];

function getJourneyColor(index: number, total: number): string {
  if (total <= 1) return JOURNEY_PALETTE[0];
  const pos = (index / (total - 1)) * (JOURNEY_PALETTE.length - 1);
  return JOURNEY_PALETTE[Math.round(pos)];
}

const MODE_ICONS: Record<string, React.ReactNode> = {
  walking: <Footprints size={12} />,
  car: <Car size={12} />,
  bus: <Bus size={12} />,
  train: <Train size={12} />,
  cycling: <Bike size={12} />,
  subway: <Train size={12} />,
  flying: <Plane size={12} />,
  unknown: <HelpCircle size={12} />,
};

function DirectionIcon({ direction }: { direction: string }) {
  const d = direction.toLowerCase();
  const size = 10;
  if (d.includes('sharp') && d.includes('left')) return <ArrowLeft size={size} />;
  if (d.includes('sharp') && d.includes('right')) return <ArrowRight size={size} />;
  if (d.includes('bear') || (d.includes('slight') && d.includes('left'))) return <ArrowUpLeft size={size} />;
  if (d.includes('bear') || (d.includes('slight') && d.includes('right'))) return <ArrowUpRight size={size} />;
  if (d.includes('left')) return <CornerDownRight size={size} style={{ transform: 'scaleX(-1)' }} />;
  if (d.includes('right')) return <CornerDownRight size={size} />;
  if (d.includes('straight') || d.includes('continue')) return <ArrowUp size={size} />;
  if (d.includes('roundabout') || d.includes('rotary')) return <RotateCw size={size} />;
  if (d.includes('depart')) return <Navigation size={size} />;
  if (d.includes('arrive')) return <MapPin size={size} />;
  if (d.includes('fork') || d.includes('keep')) return <GitFork size={size} />;
  if (d.includes('ramp') || d.includes('merge')) return <LogIn size={size} />;
  if (d.includes('exit')) return <LogOut size={size} />;
  return <ArrowUp size={size} />;
}

function ActivitySteps({ activity }: { activity: Activity }) {
  const [expanded, setExpanded] = useState(false);
  const steps = activity.steps?.filter((s) => s.distance_meters > 10) || [];
  if (steps.length === 0) return null;

  return (
    <div className="mt-1">
      <button
        type="button"
        title={expanded ? 'Hide road-by-road steps' : 'Show road-by-road steps'}
        onClick={(e) => {
          e.stopPropagation();
          setExpanded(!expanded);
        }}
        className="flex items-center gap-1 text-xs text-text-muted hover:text-text transition-colors duration-ui-fast ease-ui"
      >
        {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        <Navigation size={9} />
        <span>{steps.length} roads</span>
      </button>
      {expanded && (
        <div className="mt-1 ml-0.5 border-l-2 border-border pl-2 space-y-0.5">
          {steps.map((step, i) => (
            <div key={i} className="text-xs flex items-start gap-1.5">
              <span className="text-text-muted/50 mt-0.5 shrink-0">
                <DirectionIcon direction={step.direction} />
              </span>
              <div className="flex-1 min-w-0">
                <span className="text-accent/80 font-medium">{step.direction}</span>
                {step.name && <span className="text-text/80 ml-1">onto {step.name}</span>}
                <span className="text-text-muted/60 ml-1">
                  {formatDistance(step.distance_meters)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Build a short "story" summary of the day */
function buildDaySummary(visits: Visit[], activities: Activity[]): string {
  if (visits.length === 0) return '';

  // Deduplicate consecutive visits at same place
  const uniqueStops: string[] = [];
  for (const v of visits) {
    const name = v.place_name || v.cluster;
    if (uniqueStops.length === 0 || uniqueStops[uniqueStops.length - 1] !== name) {
      uniqueStops.push(name);
    }
  }

  if (uniqueStops.length <= 1) {
    return `Stayed at ${uniqueStops[0] || 'one location'} all day.`;
  }

  // Find unique modes used
  const modes = [...new Set(activities.map((a) => (MODE_LABELS[a.mode] || a.mode).toLowerCase()))];
  const modeStr = modes.length > 0 ? modes.join(' & ') : 'travelling';

  if (uniqueStops.length === 2) {
    return `${uniqueStops[0]} → ${uniqueStops[1]} by ${modeStr}.`;
  }

  if (uniqueStops.length <= 5) {
    return uniqueStops.join(' → ');
  }

  // For long days, summarize
  const first = uniqueStops[0];
  const last = uniqueStops[uniqueStops.length - 1];
  const middle = uniqueStops.slice(1, -1);
  const uniqueMiddle = [...new Set(middle)];

  if (first === last) {
    return `Started & ended at ${first}. Visited ${uniqueMiddle.slice(0, 4).join(', ')}${uniqueMiddle.length > 4 ? ` + ${uniqueMiddle.length - 4} more` : ''}.`;
  }
  return `${first} → ${uniqueMiddle.slice(0, 3).join(' → ')}${uniqueMiddle.length > 3 ? ` → ...` : ''} → ${last}`;
}

type CoreEvent =
  | { type: 'visit'; data: Visit; time: string; endTime: string }
  | { type: 'activity'; data: Activity; time: string; endTime: string; journeyIndex: number };

type TimelineEvent =
  | CoreEvent
  | {
      type: 'unknown';
      time: string;
      endTime: string;
      gapMinutes: number;
      connector?: Connector;
    };

interface Props {
  visits: Visit[];
  activities: Activity[];
  connectors?: Connector[];
  date: string;
  /** Playback clock (ms). Highlights the matching row. */
  activeTime?: number | null;
  /** Focus the map on this visit (e.g. place name / stop). */
  onVisitClick?: (visit: Visit) => void;
  /** Focus the map on this journey segment (walking, car, etc.). */
  onActivityClick?: (activity: Activity) => void;
  onUnknownClick?: (connector: Connector | null, startIso: string) => void;
  sourceColors?: Record<string, string>;
}

function isActiveRow(startIso: string, endIso: string, activeTime?: number | null): boolean {
  if (activeTime == null) return false;
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  return activeTime >= start && activeTime < end;
}

function matchConnector(
  connectors: Connector[],
  fromIso: string,
  toIso: string,
  used: Set<Connector>,
): Connector | undefined {
  const exact = connectors.find(
    (c) => !used.has(c) && c.from_time === fromIso && c.to_time === toIso,
  );
  if (exact) return exact;
  const fromMs = Date.parse(fromIso);
  const toMs = Date.parse(toIso);
  return connectors.find((c) => {
    if (used.has(c)) return false;
    return Math.abs(Date.parse(c.from_time) - fromMs) < 2000 && Math.abs(Date.parse(c.to_time) - toMs) < 2000;
  });
}

function buildTimelineEvents(
  visits: Visit[],
  sortedActivities: Activity[],
  connectors: Connector[],
): TimelineEvent[] {
  const core: CoreEvent[] = [
    ...visits.map((v) => ({ type: 'visit' as const, data: v, time: v.start, endTime: v.end })),
    ...sortedActivities.map((a, i) => ({
      type: 'activity' as const,
      data: a,
      time: a.start,
      endTime: a.end,
      journeyIndex: i,
    })),
  ].sort((a, b) => a.time.localeCompare(b.time));

  const used = new Set<Connector>();
  const events: TimelineEvent[] = [];
  for (let i = 0; i < core.length; i++) {
    const event = core[i];
    events.push(event);
    if (i === core.length - 1) break;
    const next = core[i + 1];
    const connector = matchConnector(connectors, event.endTime, next.time, used);
    const gapMinutes = Math.max(
      0,
      (Date.parse(next.time) - Date.parse(event.endTime)) / 60000,
    );
    if (connector) {
      used.add(connector);
      events.push({
        type: 'unknown',
        time: connector.from_time,
        endTime: connector.to_time,
        gapMinutes: Math.max(
          gapMinutes,
          (Date.parse(connector.to_time) - Date.parse(connector.from_time)) / 60000,
        ),
        connector,
      });
    } else if (gapMinutes > 5) {
      events.push({
        type: 'unknown',
        time: event.endTime,
        endTime: next.time,
        gapMinutes,
      });
    }
  }
  return events;
}

const rowBtnClass =
  'flex w-full text-left rounded-lg -mx-1 px-1 transition-colors duration-ui-emphasis ease-ui cursor-pointer hover:bg-bg/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40';

export default function Timeline({
  visits,
  activities,
  connectors = [],
  date,
  activeTime = null,
  onVisitClick,
  onActivityClick,
  onUnknownClick,
  sourceColors,
}: Props) {
  const { timezone, unit } = useUnits();
  const sortedActivities = [...activities].sort((a, b) => a.start.localeCompare(b.start));
  const totalJourneys = sortedActivities.length;
  const events = buildTimelineEvents(visits, sortedActivities, connectors);

  if (events.length === 0) {
    return <div className="text-text-muted text-sm p-4">No events for this day.</div>;
  }

  const summary = buildDaySummary(visits, sortedActivities);

  return (
    <div>
      {/* Day story summary */}
      {summary && (
        <div className="px-4 py-3 bg-accent/5 border-b border-border">
          <div className="text-xs font-semibold text-accent/70 mb-1 uppercase tracking-wide">Your day</div>
          <div className="text-sm text-text/90 leading-relaxed">{summary}</div>
        </div>
      )}

      {/* Timeline with visual spine */}
      <div className="relative">
        {events.map((event, i) => {
          const isLast = i === events.length - 1;
          const active = isActiveRow(event.time, event.endTime, activeTime);

          if (event.type === 'visit') {
            const v = event.data;
            const stopNum = v.stop_number || i + 1;
            const fromYesterday = startedBeforeDate(v.start, date);
            const overnight = continuesPastDate(v.end, date);

            return (
              <div key={`v-${i}`} className="relative">
                <button
                  type="button"
                  onClick={() => onVisitClick?.(v)}
                  disabled={!onVisitClick}
                  title={onVisitClick ? 'Show this visit on the map' : 'Visit details'}
                  className={cn(
                    onVisitClick ? rowBtnClass : 'flex w-full text-left',
                    'pb-0',
                    active && 'bg-accent/10 ring-1 ring-accent/30',
                  )}
                >
                  <div className="w-16 shrink-0 flex flex-col items-center">
                    <div className="text-[10px] text-text-muted font-mono mb-1 w-full text-center">
                      {formatTime(v.start, timezone)}
                    </div>
                    <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold text-white z-10"
                      style={{
                        background: (v.source_id && sourceColors?.[v.source_id]) || 'var(--visit)',
                        border: '2.5px solid rgba(255,255,255,0.4)',
                      }}>
                      {stopNum}
                    </div>
                    {!isLast && (
                      <div className="w-0.5 flex-1 bg-border/60 min-h-2" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0 pb-2 pt-5">
                    <div className="text-sm font-semibold text-text leading-tight">
                      {v.place_name || v.cluster}
                    </div>
                    {v.place_short_address && (
                      <div className="text-[11px] text-text-muted">{v.place_short_address}</div>
                    )}
                    {v.semantic_type !== 'Unknown' && (
                      <div className="text-[11px] text-accent">{v.semantic_type}</div>
                    )}

                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="h-5 rounded flex items-center px-2 gap-1"
                        style={{
                          backgroundColor: '#bc8cff18',
                          border: '1px solid #bc8cff33',
                          minWidth: Math.min(Math.max(v.duration_minutes / 2, 40), 200),
                        }}>
                        <Clock size={10} className="text-visit shrink-0" />
                        <span className="text-xs font-semibold text-visit whitespace-nowrap">
                          {formatDuration(v.duration_minutes)}
                        </span>
                      </div>
                      <span className="text-[10px] text-text-muted">
                        {formatTime(v.start, timezone)} - {formatTime(v.end, timezone)}
                      </span>
                    </div>
                    {(fromYesterday || overnight) && (
                      <div className="mt-1 text-[10px] text-accent">
                        {fromYesterday && <span>Started yesterday</span>}
                        {fromYesterday && overnight ? ' · ' : null}
                        {overnight && (
                          <span>Continues past midnight (left {formatTime(v.end, timezone)})</span>
                        )}
                      </div>
                    )}
                    {(v.arrived_by || v.departed_by) && (
                      <div className="mt-1 text-[10px] text-text-muted">
                        {v.arrived_by && (
                          <span>Arrived by {MODE_LABELS[v.arrived_by] || v.arrived_by}</span>
                        )}
                        {v.arrived_by && v.departed_by ? ' · ' : null}
                        {v.departed_by && (
                          <span>Left by {MODE_LABELS[v.departed_by] || v.departed_by}</span>
                        )}
                      </div>
                    )}
                  </div>
                </button>
              </div>
            );
          }

          if (event.type === 'unknown') {
            const c = event.connector;
            const clickable = Boolean(onUnknownClick);
            return (
              <div key={`u-${i}`} className="relative">
                <button
                  type="button"
                  onClick={() => onUnknownClick?.(c ?? null, event.time)}
                  disabled={!clickable}
                  title={clickable ? 'Show unknown movement on the map' : 'Unknown movement'}
                  className={cn(
                    clickable ? rowBtnClass : 'flex w-full text-left',
                    active && 'bg-accent/10 ring-1 ring-accent/30',
                  )}
                >
                  <div className="w-16 shrink-0 flex flex-col items-center">
                    <div className="text-[10px] text-text-muted font-mono w-full text-center">
                      {formatTime(event.time, timezone)}
                    </div>
                    <div className="flex-1 flex flex-col items-center py-0.5">
                      <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-dashed border-text-muted/50 text-text-muted z-10">
                        <HelpCircle size={10} />
                      </div>
                      {!isLast && (
                        <div className="w-0.5 flex-1 min-h-3 border-l-2 border-dashed border-text-muted/30" />
                      )}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 py-1.5">
                    <div className="rounded-lg border border-dashed border-border px-2.5 py-1.5">
                      <div className="text-xs font-semibold text-text-muted">Unknown movement</div>
                      <div className="mt-0.5 text-[11px] text-text-muted">
                        {formatDuration(event.gapMinutes)}
                        {c && c.distance_meters > 0 ? ` · ${formatDistance(c.distance_meters, unit)}` : ''}
                      </div>
                      <div className="mt-1 text-[10px] leading-snug text-text-muted/70">
                        {UNKNOWN_MOVEMENT_HINT}
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            );
          }

          const a = event.data;
          const color =
            (a.source_id && sourceColors?.[a.source_id]) ||
            getJourneyColor(event.journeyIndex, totalJourneys);
          const mainRoads = a.steps?.filter((s) => s.name && s.distance_meters > 100).slice(0, 3).map((s) => s.name).filter(Boolean);

          return (
            <div key={`a-${i}`} className="relative">
              <button
                type="button"
                onClick={() => onActivityClick?.(a)}
                disabled={!onActivityClick}
                title={onActivityClick ? 'Show this journey on the map' : 'Journey details'}
                className={cn(
                  onActivityClick ? rowBtnClass : 'flex w-full text-left',
                  active && 'bg-accent/10 ring-1 ring-accent/30',
                )}
              >
                <div className="w-16 shrink-0 flex flex-col items-center">
                  <div className="text-[10px] font-mono w-full text-center" style={{ color: `${color}99` }}>
                    {formatTime(a.start, timezone)}
                  </div>
                  <div className="flex-1 flex flex-col items-center py-0.5">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 z-10"
                      style={{ backgroundColor: `${color}25`, border: `2px solid ${color}66` }}>
                      <span style={{ color }}>{MODE_ICONS[a.mode] || <CircleDot size={10} />}</span>
                    </div>
                    <div className="w-0.5 flex-1 min-h-3" style={{ backgroundColor: `${color}55` }} />
                    <ArrowDown size={10} style={{ color: `${color}77` }} className="shrink-0 -mt-1" />
                  </div>
                </div>

                <div className="flex-1 min-w-0 py-1.5">
                  <div className="rounded-lg px-2.5 py-1.5" style={{ backgroundColor: `${color}08`, borderLeft: `3px solid ${color}55` }}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold" style={{ color }}>
                        {a.from_place && a.to_place
                          ? `${a.from_place} → ${a.to_place}`
                          : MODE_LABELS[a.mode] || a.mode}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-[10px] px-1 rounded font-mono"
                        style={{ backgroundColor: `${color}20`, color }}>
                        {MODE_LABELS[a.mode] || a.mode}
                      </span>
                      <span className="text-[11px] text-text-muted">
                        {formatDistance(a.distance_meters, unit)} · {formatDuration(a.duration_minutes)}
                      </span>
                    </div>
                    {mainRoads && mainRoads.length > 0 && (
                      <div className="text-[10px] text-text-muted/50 mt-0.5 truncate">
                        via {mainRoads.join(' → ')}
                      </div>
                    )}
                    <ActivitySteps activity={a} />
                  </div>
                </div>
              </button>
            </div>
          );
        })}

        {/* End marker */}
        <div className="flex">
          <div className="w-16 flex justify-center">
            <div className="w-3 h-3 rounded-full bg-text-muted/30 border-2 border-text-muted/20" />
          </div>
          <div className="text-[10px] text-text-muted/40 pt-0.5">End of day</div>
        </div>
      </div>
    </div>
  );
}
