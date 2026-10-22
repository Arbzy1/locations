import { Link } from 'react-router-dom';
import { History } from 'lucide-react';
import { Card, CardTitle } from '../ui/card';
import { Skeleton } from '../ui/skeleton';
import { useOnThisDay } from '../../hooks/useApi';
import { useUnits } from '../../lib/units';
import { formatMilesOrKm } from '../../utils/format';

/** Today's date in the user's own calendar, so "on this day" matches theirs. */
function localToday(timezone: string | null) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone ?? undefined }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/** The same day in earlier years. Shown in the app only; it is never emailed. */
export default function OnThisDayCard() {
  const { unit, timezone } = useUnits();
  const today = localToday(timezone);
  const { data, isLoading } = useOnThisDay(today);
  const years = data?.years ?? [];
  if (!isLoading && !years.length) return null;

  return (
    <Card>
      <CardTitle className="flex items-center gap-2 text-base">
        <History size={18} className="text-accent" />
        On this day
      </CardTitle>
      {isLoading ? (
        <Skeleton className="mt-3 h-16 w-full" />
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {years.map((y) => (
            <li key={y.date}>
              <Link
                to={`/day/${y.date}`}
                title={`Open ${y.date} in Days`}
                className="flex min-h-11 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-md px-1 py-2 transition-colors duration-ui-hover ease-ui hover:bg-bg"
              >
                <span className="font-medium text-text">
                  {y.years_ago} year{y.years_ago === 1 ? '' : 's'} ago
                  <span className="ml-2 text-xs font-normal text-text-muted">{y.date}</span>
                </span>
                <span className="text-xs text-text-muted">
                  {formatMilesOrKm(y.miles, unit)} · {y.journeys} journeys
                </span>
                {y.places.length > 0 && (
                  <span className="w-full truncate text-sm text-text-muted">
                    {y.places.map((p) => p.label).join(', ')}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
