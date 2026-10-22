export type LondonParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
  date: string;
};

const WEEKDAY: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

export function londonParts(instant: string | number): LondonParts {
  const date = typeof instant === "number" ? new Date(instant) : new Date(instant);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  return {
    year,
    month,
    day,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: WEEKDAY[get("weekday")] ?? 1,
    date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

export function localDaysTouched(departsAtIso: string, durationSeconds: number): string[] {
  const start = Date.parse(departsAtIso);
  const end = start + Math.max(0, durationSeconds) * 1000;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
  const days: string[] = [];
  const seen = new Set<string>();
  let t = start;
  const step = 15 * 60 * 1000;
  while (t <= end) {
    const date = londonParts(t).date;
    if (!seen.has(date)) {
      seen.add(date);
      days.push(date);
    }
    t += step;
  }
  const last = londonParts(end).date;
  if (!seen.has(last)) days.push(last);
  return days;
}
