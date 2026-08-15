import type { FunFact, MonthlyStats, Streaks, YearlyStats } from '../../types';
import { formatMilesOrKm, type DistanceUnit } from '../../utils/format';

function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function insightsCsv(
  yearly: YearlyStats[] | undefined,
  monthly: MonthlyStats[] | undefined,
  facts: FunFact[] | undefined,
  streaks: Streaks | null,
  compare: { a?: YearlyStats; b?: YearlyStats },
  unit: DistanceUnit,
): string {
  const rows: string[][] = [['section', 'key', 'value']];
  for (const y of yearly ?? []) {
    rows.push(['yearly', String(y.year), formatMilesOrKm(y.distance_miles, unit)]);
    rows.push(['yearly-days', String(y.year), String(y.days_tracked)]);
    rows.push(['yearly-visits', String(y.year), String(y.visits)]);
  }
  for (const m of monthly ?? []) {
    rows.push(['monthly', m.month, formatMilesOrKm(m.distance_miles, unit)]);
  }
  for (const f of facts ?? []) {
    rows.push(['fact', f.label, f.value]);
  }
  if (streaks) {
    rows.push(['streaks', 'current', String(streaks.current)]);
    rows.push(['streaks', 'longest', String(streaks.longest)]);
    rows.push(['streaks', 'longestGap', String(streaks.longestGap)]);
  }
  if (compare.a) {
    rows.push(['compare', String(compare.a.year), formatMilesOrKm(compare.a.distance_miles, unit)]);
  }
  if (compare.b) {
    rows.push(['compare', String(compare.b.year), formatMilesOrKm(compare.b.distance_miles, unit)]);
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\n');
}

export function downloadTextFile(filename: string, contents: string, mime: string): void {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadElementPng(elementId: string, filename: string): Promise<void> {
  const node = document.getElementById(elementId);
  if (!node) return;
  const { toPng } = await import('html-to-image');
  const bg =
    getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#0d1117';
  const dataUrl = await toPng(node, { cacheBust: true, pixelRatio: 2, backgroundColor: bg });
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}
