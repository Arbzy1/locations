import type { ActivityRow, VisitRow } from "./schema.js";
import { METERS_TO_MILES } from "./geo.js";

export type ActivityGuess = {
  id: string;
  label: string;
};

export type ActivityGuessCount = ActivityGuess & { count: number };

export type CoverageBadge = {
  id: string;
  label: string;
  earned: boolean;
  detail: string;
};

export type BadgeSummary = {
  coveragePercent: number;
  daysWithData: number;
  spanDays: number;
  uniquePlaces: number;
  visitCount: number;
  badges: CoverageBadge[];
};

function hourFromStart(start: string): number {
  const d = new Date(start);
  return Number.isNaN(d.getTime()) ? 12 : d.getUTCHours();
}

/** Heuristic only: dwell + hour + Google semantic type. No coordinates, no LLM. */
export function guessActivityLabel(input: {
  semanticType: string;
  durationMinutes: number;
  start: string;
}): ActivityGuess {
  const type = (input.semanticType || "").toLowerCase();
  const hour = hourFromStart(input.start);
  const mins = input.durationMinutes;

  if (type === "home") {
    if (mins >= 360) return { id: "home_long", label: "At home" };
    return { id: "home", label: "Home stop" };
  }
  if (type === "work") {
    if (mins >= 180) return { id: "work_day", label: "Workday" };
    return { id: "work", label: "At work" };
  }
  if (mins >= 480 && (hour >= 20 || hour < 8)) {
    return { id: "overnight", label: "Overnight stay" };
  }
  if (/restaurant|cafe|coffee|food|meal|bar/.test(type) && mins >= 20) {
    return { id: "meal", label: "A meal" };
  }
  if (/gym|fitness|sport/.test(type)) return { id: "exercise", label: "Exercise" };
  if (/school|university|college/.test(type)) return { id: "school", label: "School" };
  if (/airport|transit|station|subway/.test(type)) {
    return { id: "transit", label: "In transit" };
  }
  if (/park|outdoor/.test(type)) return { id: "outdoors", label: "Outdoors" };
  if (/shop|store|mall|supermarket|grocery/.test(type)) {
    return { id: "errand", label: "Errand" };
  }
  if (hour >= 6 && hour < 10 && mins < 90) {
    return { id: "morning", label: "Morning stop" };
  }
  if (hour >= 17 && hour < 21 && mins >= 30) {
    return { id: "evening", label: "Evening stop" };
  }
  if (mins >= 120) return { id: "long_stay", label: "Long stay" };
  return { id: "stop", label: "A stop" };
}

export function computeActivityGuesses(visits: VisitRow[]): ActivityGuessCount[] {
  const counts = new Map<string, ActivityGuessCount>();
  for (const v of visits) {
    const guess = guessActivityLabel({
      semanticType: v.semanticType,
      durationMinutes: v.durationMinutes,
      start: v.start,
    });
    const prev = counts.get(guess.id);
    if (prev) prev.count += 1;
    else counts.set(guess.id, { ...guess, count: 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function utcDaySpan(first: string, last: string): number {
  const a = Date.parse(`${first}T00:00:00Z`);
  const b = Date.parse(`${last}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

export function computeBadges(input: {
  visits: VisitRow[];
  activities: ActivityRow[];
  allDates: string[];
}): BadgeSummary {
  const dates = [...input.allDates].sort();
  const daysWithData = dates.length;
  const spanDays = dates.length ? utcDaySpan(dates[0], dates[dates.length - 1]) : 0;
  const coveragePercent =
    spanDays > 0 ? Math.round((daysWithData / spanDays) * 1000) / 10 : 0;
  const uniquePlaces = new Set(input.visits.map((v) => v.cluster)).size;
  const visitCount = input.visits.length;
  let walkMiles = 0;
  for (const a of input.activities) {
    if (a.mode === "walking") walkMiles += a.distanceMeters * METERS_TO_MILES;
  }

  const badges: CoverageBadge[] = [
    {
      id: "first_import",
      label: "First import",
      earned: visitCount > 0,
      detail: visitCount > 0 ? "Timeline visits are in" : "Import a Timeline export",
    },
    {
      id: "week_tracked",
      label: "Week of history",
      earned: daysWithData >= 7,
      detail: `${daysWithData} days with data`,
    },
    {
      id: "month_tracked",
      label: "Month of history",
      earned: daysWithData >= 28,
      detail: `${daysWithData} days with data`,
    },
    {
      id: "hundred_places",
      label: "Hundred places",
      earned: uniquePlaces >= 100,
      detail: `${uniquePlaces} distinct clusters`,
    },
    {
      id: "thousand_visits",
      label: "Thousand visits",
      earned: visitCount >= 1000,
      detail: `${visitCount} visits`,
    },
    {
      id: "walker",
      label: "Walker",
      earned: walkMiles >= 50,
      detail: "At least 50 miles recorded as walking",
    },
    {
      id: "coverage_half",
      label: "Half coverage",
      earned: coveragePercent >= 50,
      detail: `${coveragePercent}% of days in the span have Timeline`,
    },
  ];

  return {
    coveragePercent,
    daysWithData,
    spanDays,
    uniquePlaces,
    visitCount,
    badges,
  };
}
