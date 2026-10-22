import { parseCarbonIntensity } from "./parse.js";
import type { CarbonIntensityPeriod } from "./types.js";

export const CARBON_INTENSITY_ORIGIN = "https://api.carbonintensity.org.uk";
export const CARBON_LOOKBACK_MS = 48 * 60 * 60 * 1000;
export const CARBON_LOOKAHEAD_MS = 48 * 60 * 60 * 1000;

export function toCarbonStamp(iso: string): string {
  const ms = Date.parse(iso);
  const date = Number.isFinite(ms) ? new Date(ms) : new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}Z`;
}

export function carbonIntensityRangeUrl(fromIso: string, toIso: string): string {
  return `${CARBON_INTENSITY_ORIGIN}/intensity/${toCarbonStamp(fromIso)}/${toCarbonStamp(toIso)}`;
}

export function carbonWindow(nowIso: string): { fromIso: string; toIso: string } {
  const now = Date.parse(nowIso);
  const origin = Number.isFinite(now) ? now : 0;
  return {
    fromIso: new Date(origin - CARBON_LOOKBACK_MS).toISOString(),
    toIso: new Date(origin + CARBON_LOOKAHEAD_MS).toISOString(),
  };
}

export async function pullCarbonIntensity(input: {
  fetch: typeof globalThis.fetch;
  nowIso: string;
}): Promise<{ periods: CarbonIntensityPeriod[]; raw: unknown }> {
  const window = carbonWindow(input.nowIso);
  const url = carbonIntensityRangeUrl(window.fromIso, window.toIso);
  const res = await input.fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Carbon Intensity HTTP ${res.status}`);
  }
  const raw: unknown = await res.json();
  return { periods: parseCarbonIntensity(raw), raw };
}
