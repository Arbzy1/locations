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

export function formatDuration(minutes: number): string {
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}

export function formatTime(isoString: string, timeZone?: string | null): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timeZone || undefined,
  });
}

export function formatDate(dateStr: string, timeZone?: string | null): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: timeZone || undefined,
  });
}
