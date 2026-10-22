export const OPEN_METEO_ORIGIN = "https://api.open-meteo.com";
export const FIXTURE_FORECAST_TEMP_C = 12;

function hourStamp(iso: string): string {
  const ms = Date.parse(iso);
  const date = Number.isFinite(ms) ? new Date(ms) : new Date(0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:00`;
}

export function openMeteoForecastUrl(lat: number, lng: number, atIso: string): string {
  const hour = hourStamp(atIso);
  const url = new URL("/v1/forecast", OPEN_METEO_ORIGIN);
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("hourly", "temperature_2m");
  url.searchParams.set("start_hour", hour);
  url.searchParams.set("end_hour", hour);
  url.searchParams.set("timezone", "UTC");
  return url.toString();
}

export function pickHourlyTemperature(json: unknown, atIso: string): number | undefined {
  if (!json || typeof json !== "object") return undefined;
  const hourly = (json as { hourly?: { time?: unknown; temperature_2m?: unknown } }).hourly;
  const times = hourly?.time;
  const temps = hourly?.temperature_2m;
  if (!Array.isArray(times) || !Array.isArray(temps)) return undefined;
  const at = Date.parse(atIso);
  if (!Number.isFinite(at)) return undefined;
  let best: { temp: number; delta: number } | undefined;
  for (let i = 0; i < times.length; i += 1) {
    const stamp = times[i];
    const temp = temps[i];
    if (typeof stamp !== "string" || typeof temp !== "number" || !Number.isFinite(temp)) continue;
    const ms = Date.parse(stamp.endsWith("Z") ? stamp : `${stamp}Z`);
    if (!Number.isFinite(ms)) continue;
    const delta = Math.abs(ms - at);
    if (delta > 90 * 60 * 1000) continue;
    if (!best || delta < best.delta) best = { temp, delta };
  }
  return best?.temp;
}
