import type { Streaks, YearInReviewChapter } from '../types';

export function pickLatestYearReview(data: unknown): YearInReviewChapter | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const row = data as Record<string, unknown>;
  if (typeof row.year === 'number') return data as YearInReviewChapter;
  const years = Object.keys(row)
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  const last = years[years.length - 1];
  if (last == null) return null;
  const chapter = row[String(last)];
  if (!chapter || typeof chapter !== 'object' || Array.isArray(chapter)) return null;
  if (typeof (chapter as YearInReviewChapter).year !== 'number') return null;
  return chapter as YearInReviewChapter;
}

export function currentMonthYm(timeZone?: string | null, now = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || undefined,
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(now);
    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    if (year && month) return `${year}-${month}`;
  } catch {
    /* UTC fallback */
  }
  return now.toISOString().slice(0, 7);
}

export function isStreaks(value: unknown): value is Streaks {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && 'current' in value;
}
