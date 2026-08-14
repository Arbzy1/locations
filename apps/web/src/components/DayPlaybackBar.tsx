import { Pause, Play, Sun, Sunset } from 'lucide-react';
import { Button } from './ui/button';
import { formatTime } from '../utils/format';
import { PLAYBACK_SPEEDS, type PlaybackSpeed } from '../lib/dayPlayback';
import { cn } from '../lib/utils';

interface Props {
  rangeStart: number;
  rangeEnd: number;
  time: number;
  playing: boolean;
  speed: PlaybackSpeed;
  sunriseMs?: number | null;
  sunsetMs?: number | null;
  timezone?: string | null;
  compact?: boolean;
  onTogglePlay: () => void;
  onCycleSpeed: () => void;
  onSeek: (t: number) => void;
}

function inRange(ms: number, start: number, end: number): boolean {
  return ms >= start && ms <= end;
}

function pct(ms: number, start: number, end: number): number {
  const span = Math.max(1, end - start);
  return ((ms - start) / span) * 100;
}

function speedLabel(speed: PlaybackSpeed): string {
  return speed >= 60 ? `${speed / 60}h/s` : `${speed} min/s`;
}

export default function DayPlaybackBar({
  rangeStart,
  rangeEnd,
  time,
  playing,
  speed,
  sunriseMs,
  sunsetMs,
  timezone,
  compact = false,
  onTogglePlay,
  onCycleSpeed,
  onSeek,
}: Props) {
  const iso = new Date(time).toISOString();
  const nextSpeed = PLAYBACK_SPEEDS[(PLAYBACK_SPEEDS.indexOf(speed) + 1) % PLAYBACK_SPEEDS.length];
  const sunrisePct =
    sunriseMs != null && inRange(sunriseMs, rangeStart, rangeEnd)
      ? pct(sunriseMs, rangeStart, rangeEnd)
      : null;
  const sunsetPct =
    sunsetMs != null && inRange(sunsetMs, rangeStart, rangeEnd)
      ? pct(sunsetMs, rangeStart, rangeEnd)
      : null;

  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-surface/95 shadow-lg backdrop-blur-sm',
        compact ? 'px-2 py-2' : 'px-3 py-2.5',
      )}
    >
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="icon"
          variant="outline"
          title={playing ? 'Pause day playback' : 'Play estimated day path'}
          aria-label={playing ? 'Pause day playback' : 'Play estimated day path'}
          onClick={onTogglePlay}
        >
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </Button>
        <div className="min-w-0 flex-1">
          <div className="relative">
            <input
              type="range"
              min={rangeStart}
              max={rangeEnd}
              step={1000}
              value={Math.min(rangeEnd, Math.max(rangeStart, time))}
              title="Scrub estimated time; map follows"
              aria-label="Scrub estimated time"
              aria-valuetext={formatTime(iso, timezone)}
              onChange={(e) => onSeek(Number(e.target.value))}
              className="h-11 w-full cursor-pointer appearance-none bg-transparent accent-[var(--accent)]"
            />
            {sunrisePct != null && (
              <span
                className="pointer-events-none absolute top-0 h-2 w-0.5 rounded-full bg-accent"
                style={{ left: `${sunrisePct}%` }}
                aria-hidden
              />
            )}
            {sunsetPct != null && (
              <span
                className="pointer-events-none absolute top-0 h-2 w-0.5 rounded-full bg-text-muted"
                style={{ left: `${sunsetPct}%` }}
                aria-hidden
              />
            )}
          </div>
        </div>
        <div className="w-[4.5rem] shrink-0 text-right font-mono text-xs text-text tabular-nums">
          {formatTime(iso, timezone)}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          title={`Playback speed ${speedLabel(speed)}. Click for ${speedLabel(nextSpeed)}`}
          aria-label={`Playback speed ${speedLabel(speed)}. Next ${speedLabel(nextSpeed)}`}
          onClick={onCycleSpeed}
          className="min-w-[4.75rem] px-2 font-mono text-xs"
        >
          {speedLabel(speed)}
        </Button>
      </div>
      <div
        className={cn(
          'mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-text-muted',
          compact && 'mt-0.5',
        )}
      >
        <span>Estimated path along recorded stays and predicted routes</span>
        {sunriseMs != null && (
          <span className="inline-flex items-center gap-1">
            <Sun size={10} className="text-accent" />
            Sunrise {formatTime(new Date(sunriseMs).toISOString(), timezone)}
          </span>
        )}
        {sunsetMs != null && (
          <span className="inline-flex items-center gap-1">
            <Sunset size={10} />
            Sunset {formatTime(new Date(sunsetMs).toISOString(), timezone)}
          </span>
        )}
      </div>
    </div>
  );
}
