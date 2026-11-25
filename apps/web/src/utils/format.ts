export type DistanceUnit = 'mi' | 'km';

export function metersToMiles(meters: number): number {
  return meters * 0.000621371;
}

export function metersToKm(meters: number): number {
  return meters / 1000;
}

export function formatMiles(miles: number): string {
  if (miles < 0.1) return '< 0.1 mi';
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles).toLocaleString()} mi`;
}

export function formatKm(km: number): string {
  if (km < 0.1) return '< 0.1 km';
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString()} km`;
}

export function formatDistance(meters: number, unit: DistanceUnit = 'mi'): string {
  return unit === 'km' ? formatKm(metersToKm(meters)) : formatMiles(metersToMiles(meters));
}

export function formatMilesOrKm(miles: number, unit: DistanceUnit = 'mi'): string {
  if (unit === 'km') return formatKm(miles / 0.621371);
  return formatMiles(miles);
}

const MINUTES_PER_DAY = 24 * 60;

/** Days, then hours, then minutes. A zero part is left out. */
export function formatDuration(minutes: number): string {
  if (minutes < 1) return '< 1 min';
  const total = Math.round(minutes);
  if (total < 60) return `${total} min`;
  const days = Math.floor(total / MINUTES_PER_DAY);
  const hrs = Math.floor((total % MINUTES_PER_DAY) / 60);
  const mins = total % 60;
  if (days === 0) {
    if (mins === 0) return `${hrs}h`;
    return `${hrs}h ${mins}m`;
  }
  const parts = [`${days}d`];
  if (hrs > 0) parts.push(`${hrs}h`);
  if (mins > 0) parts.push(`${mins}m`);
  return parts.join(' ');
}

export function isValidIanaTimeZone(timeZone: string): boolean {
  const trimmed = timeZone.trim();
  if (!trimmed) return false;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: trimmed });
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns undefined when no timezone was supplied (use runtime default),
 * the trimmed valid IANA zone, or 'UTC' if an invalid zone string was stored.
 */
export function resolveSafeTimeZone(timeZone?: string | null): string | undefined {
  if (timeZone == null) return undefined;
  const trimmed = timeZone.trim();
  if (!trimmed) return undefined;
  return isValidIanaTimeZone(trimmed) ? trimmed : 'UTC';
}

const ISO_DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function formatTime(isoString: string, timeZone?: string | null): string {
  const d = new Date(isoString);
  const safeTz = resolveSafeTimeZone(timeZone);
  try {
    return d.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      ...(safeTz ? { timeZone: safeTz } : {}),
    });
  } catch {
    return d.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    });
  }
}

export function formatDate(dateStr: string, timeZone?: string | null): string {
  if (ISO_DATE_ONLY_RE.test(dateStr)) {
    const d = new Date(`${dateStr}T12:00:00Z`);
    return d.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
  const d = new Date(dateStr);
  const safeTz = resolveSafeTimeZone(timeZone);
  try {
    return d.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      ...(safeTz ? { timeZone: safeTz } : {}),
    });
  } catch {
    return d.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
}
