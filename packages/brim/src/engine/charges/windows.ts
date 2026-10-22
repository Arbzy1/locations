import type { ChargeHoursJson } from '../../shared/index.js';
import { londonParts, type LondonParts } from "./londonTime.js";

function parseHm(value: string): number {
  const [h, m] = value.split(":").map((n) => Number(n));
  return (h ?? 0) * 60 + (m ?? 0);
}

function monthDay(parts: LondonParts): string {
  return `${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function matchesDateToken(token: string, parts: LondonParts): boolean {
  if (token.length === 10) return token === parts.date;
  return token === monthDay(parts);
}

function inRange(startToken: string, endToken: string, parts: LondonParts): boolean {
  const key = startToken.length === 10 ? parts.date : monthDay(parts);
  if (startToken <= endToken) return key >= startToken && key <= endToken;
  return key >= startToken || key <= endToken;
}

function isExempt(hours: ChargeHoursJson, parts: LondonParts): boolean {
  if (hours.exemptDates?.some((d) => matchesDateToken(d, parts))) return true;
  return Boolean(hours.exemptRanges?.some((r) => inRange(r.start, r.end, parts)));
}

function effectiveWeekday(hours: ChargeHoursJson, parts: LondonParts): number {
  if (hours.weekendLikeDates?.some((d) => matchesDateToken(d, parts))) return 6;
  return parts.weekday;
}

export function windowApplies(hours: ChargeHoursJson, instantIso: string): boolean {
  return windowAppliesAt(hours, londonParts(instantIso));
}

export function windowAppliesAt(hours: ChargeHoursJson, parts: LondonParts): boolean {
  if (isExempt(hours, parts)) return false;
  if (hours.always) return true;
  if (!hours.windows || hours.windows.length === 0) return true;
  const weekday = effectiveWeekday(hours, parts);
  const minutes = parts.hour * 60 + parts.minute;
  return hours.windows.some((w) => {
    if (!w.days.includes(weekday as 1 | 2 | 3 | 4 | 5 | 6 | 7)) return false;
    const start = parseHm(w.start);
    const end = parseHm(w.end);
    return minutes >= start && minutes < end;
  });
}

export function daysWindowApplies(
  hours: ChargeHoursJson,
  departsAtIso: string,
  durationSeconds: number,
): string[] {
  const start = Date.parse(departsAtIso);
  const end = start + Math.max(0, durationSeconds) * 1000;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
  const days: string[] = [];
  const seen = new Set<string>();
  let t = start;
  const step = 15 * 60 * 1000;
  while (t <= end) {
    const parts = londonParts(t);
    if (windowAppliesAt(hours, parts) && !seen.has(parts.date)) {
      seen.add(parts.date);
      days.push(parts.date);
    }
    t += step;
  }
  const endParts = londonParts(end);
  if (windowAppliesAt(hours, endParts) && !seen.has(endParts.date)) days.push(endParts.date);
  return days;
}
