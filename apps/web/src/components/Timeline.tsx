import { useState } from 'react';
import type { Visit, Activity } from '../types';
import { MODE_LABELS } from '../types';
import { formatTime, formatDuration, formatDistance } from '../utils/format';
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
        className="flex items-center gap-1 text-xs text-text-muted hover:text-text transition-colors duration-300 ease-out"
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

type TimelineEvent =
  | { type: 'visit'; data: Visit; time: string; endTime: string }
  | { type: 'activity'; data: Activity; time: string; endTime: string; journeyIndex: number };

interface Props {
  visits: Visit[];
  activities: Activity[];
  /** Focus the map on this visit (e.g. place name / stop). */
  onVisitClick?: (visit: Visit) => void;
  /** Focus the map on this journey segment (walking, car, etc.). */
  onActivityClick?: (activity: Activity) => void;
}

export default function Timeline({
  visits,
  activities,
  onVisitClick,
  onActivityClick,
}: Props) {
  const sortedActivities = [...activities].sort((a, b) => a.start.localeCompare(b.start));
  const totalJourneys = sortedActivities.length;

  const events: TimelineEvent[] = [
    ...visits.map((v) => ({ type: 'visit' as const, data: v, time: v.start, endTime: v.end })),
    ...sortedActivities.map((a, i) => ({ type: 'activity' as const, data: a, time: a.start, endTime: a.end, journeyIndex: i })),
  ].sort((a, b) => a.time.localeCompare(b.time));

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

          if (event.type === 'visit') {
            const v = event.data;
            const stopNum = v.stop_number || i + 1;

            // Calculate time gap to next event
            let gapMinutes = 0;
            if (!isLast) {
              const nextTime = new Date(events[i + 1].time).getTime();
              const thisEnd = new Date(v.end).getTime();
              gapMinutes = Math.max(0, (nextTime - thisEnd) / 60000);
            }

            return (
              <div key={`v-${i}`} className="relative">
                <button
                  type="button"
                  onClick={() => onVisitClick?.(v)}
                  disabled={!onVisitClick}
                  title={onVisitClick ? 'Show this visit on the map' : 'Visit details'}
                  className={
                    onVisitClick
                      ? 'flex w-full text-left rounded-lg -mx-1 px-1 pb-0 transition-colors duration-300 ease-out cursor-pointer hover:bg-bg/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40'
                      : 'flex w-full text-left'
                  }
                >
                  {/* Left: time + spine */}
                  <div className="w-16 shrink-0 flex flex-col items-center">
                    <div className="text-[10px] text-text-muted font-mono mb-1 w-full text-center">
                      {formatTime(v.start)}
                    </div>
                    {/* Stop dot */}
                    <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold text-white z-10"
                      style={{ background: '#bc8cff', border: '2.5px solid rgba(255,255,255,0.4)' }}>
                      {stopNum}
                    </div>
                    {/* Spine continues down */}
                    {!isLast && (
                      <div className="w-0.5 flex-1 bg-border/60 min-h-2" />
                    )}
                  </div>

                  {/* Right: content */}
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

                    {/* Stay bar — visual representation of time */}
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
                        {formatTime(v.start)} – {formatTime(v.end)}
                      </span>
                    </div>
                  </div>
                </button>

                {/* Time gap indicator (if gap > 5 min between this and next) */}
                {gapMinutes > 5 && !isLast && (
                  <div className="flex">
                    <div className="w-16 flex justify-center">
                      <div className="w-0.5 bg-border/30 h-4" style={{ borderLeft: '2px dashed #30363d44' }} />
                    </div>
                    <div className="text-[10px] text-text-muted/40 italic pt-1">
                      {formatDuration(gapMinutes)} gap
                    </div>
                  </div>
                )}
              </div>
            );
          } else {
            const a = event.data;
            const color = getJourneyColor(event.journeyIndex, totalJourneys);
            const mainRoads = a.steps?.filter((s) => s.name && s.distance_meters > 100).slice(0, 3).map((s) => s.name).filter(Boolean);

            return (
              <div key={`a-${i}`} className="relative">
                <button
                  type="button"
                  onClick={() => onActivityClick?.(a)}
                  disabled={!onActivityClick}
                  title={onActivityClick ? 'Show this journey on the map' : 'Journey details'}
                  className={
                    onActivityClick
                      ? 'flex w-full text-left rounded-lg -mx-1 px-1 transition-colors duration-300 ease-out cursor-pointer hover:bg-bg/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40'
                      : 'flex w-full text-left'
                  }
                >
                  {/* Left: spine with journey indicator */}
                  <div className="w-16 shrink-0 flex flex-col items-center">
                    <div className="text-[10px] font-mono w-full text-center" style={{ color: `${color}99` }}>
                      {formatTime(a.start)}
                    </div>
                    {/* Journey connector line */}
                    <div className="flex-1 flex flex-col items-center py-0.5">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 z-10"
                        style={{ backgroundColor: `${color}25`, border: `2px solid ${color}66` }}>
                        <span style={{ color }}>{MODE_ICONS[a.mode] || <CircleDot size={10} />}</span>
                      </div>
                      {/* Colored journey line */}
                      <div className="w-0.5 flex-1 min-h-3" style={{ backgroundColor: `${color}55` }} />
                      <ArrowDown size={10} style={{ color: `${color}77` }} className="shrink-0 -mt-1" />
                    </div>
                  </div>

                  {/* Right: compact journey info */}
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
                          {formatDistance(a.distance_meters)} · {formatDuration(a.duration_minutes)}
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
          }
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
