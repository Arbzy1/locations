const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH = /^\d{4}-\d{2}$/;
const GPS =
  /^\s*(-?\d{1,3}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

export type ParsedCommand =
  | { kind: "empty" }
  | { kind: "help" }
  | { kind: "day"; date: string }
  | { kind: "month"; ym: string }
  | { kind: "gps"; lat: number; lon: number }
  | { kind: "text"; q: string };

export type ChordPath =
  | "/hotspots"
  | "/day"
  | "/trips"
  | "/insights"
  | "/places"
  | "/settings";

export const CHORD_MAP: Record<string, ChordPath> = {
  h: "/hotspots",
  d: "/day",
  t: "/trips",
  i: "/insights",
  e: "/places",
  s: "/settings",
};

export function parseGps(raw: string): { lat: number; lon: number } | null {
  const m = GPS.exec(raw.trim());
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

export function isHelpQuery(raw: string): boolean {
  return raw.trim() === "?";
}

export function parseCommandQuery(raw: string): ParsedCommand {
  const q = raw.trim();
  if (!q) return { kind: "empty" };
  if (isHelpQuery(q)) return { kind: "help" };
  if (ISO_DATE.test(q)) return { kind: "day", date: q };
  if (ISO_MONTH.test(q)) return { kind: "month", ym: q };
  const gps = parseGps(q);
  if (gps) return { kind: "gps", lat: gps.lat, lon: gps.lon };
  return { kind: "text", q };
}

export function chordTarget(key: string): ChordPath | null {
  return CHORD_MAP[key.toLowerCase()] ?? null;
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

export function isPasswordField(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const el = target instanceof HTMLInputElement ? target : target.closest("input");
  return el instanceof HTMLInputElement && el.type === "password";
}
