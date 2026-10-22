import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { ArrowLeft, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { useHotspotDays } from '../../hooks/useApi';
import { formatDuration, formatTime } from '../../utils/format';
import { useUnits } from '../../lib/units';

interface Props {
  point: { lat: number; lon: number };
  label: string;
  onBack: () => void;
}

/** Days with a stay at one hotspot, each one tap from Day View (new tab keeps this list). */
export default function HotspotDays({ point, label, onBack }: Props) {
  const { data, isLoading, isError } = useHotspotDays(point);
  const { timezone } = useUnits();

  return (
    <div className="ui-enter p-3">
      <div className="mb-3 flex items-start gap-2">
        <Button variant="ghost" size="icon" title="Back to the hotspot list" aria-label="Back to the hotspot list" onClick={onBack}>
          <ArrowLeft size={16} />
        </Button>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-text">{label}</div>
          {data && (
            <div className="text-xs text-text-muted">
              {data.total_days} day{data.total_days === 1 ? '' : 's'} · {formatDuration(data.total_minutes)} in total ·
              within {data.radius_m} m
            </div>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 p-2 text-sm text-text-muted">
          <Loader2 size={14} className="animate-spin text-accent" /> Finding your days here...
        </div>
      )}
      {isError && <p className="p-2 text-sm text-train">Could not load days for this spot.</p>}
      {data && !data.days.length && <p className="p-2 text-sm text-text-muted">No stays recorded right here.</p>}

      <ul className="flex flex-col gap-1">
        {data?.days.map((d) => (
          <li
            key={d.date}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors duration-ui-emphasis ease-ui hover:bg-bg/60"
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm text-text">{format(parseISO(d.date), 'EEE d MMM yyyy')}</div>
              <div className="text-[11px] text-text-muted">
                {formatDuration(d.minutes)}
                {d.visits > 1 ? ` · ${d.visits} stays` : ''} · {formatTime(d.first, timezone)} to{' '}
                {formatTime(d.last, timezone)}
              </div>
            </div>
            <Button asChild variant="outline" size="sm" title="Open this day in a new tab (keeps this list here)">
              <a href={`/day/${d.date}`} target="_blank" rel="noopener">
                <ExternalLink size={12} /> New tab
              </a>
            </Button>
            <Button asChild variant="ghost" size="sm" title="Open this day here">
              <Link to={`/day/${d.date}`}>Open</Link>
            </Button>
          </li>
        ))}
      </ul>
      {data?.truncated && <p className="mt-2 text-xs text-text-muted">Showing the most recent {data.days.length} days.</p>}
    </div>
  );
}
