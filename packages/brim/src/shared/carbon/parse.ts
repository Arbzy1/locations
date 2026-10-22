import type {
  CarbonIntensityApiPeriod,
  CarbonIntensityApiResponse,
  CarbonIntensityPeriod,
} from "./types.js";

export const CARBON_INTENSITY_REGION = "GB";
export const GRID_INTENSITY_FALLBACK_G = 150;

function asIso(value: string): string | undefined {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return undefined;
  return new Date(ms).toISOString();
}

function pickValue(period: CarbonIntensityApiPeriod): { g: number; source: "actual" | "forecast" } | undefined {
  const actual = period.intensity?.actual;
  if (typeof actual === "number" && Number.isFinite(actual)) {
    return { g: actual, source: "actual" };
  }
  const forecast = period.intensity?.forecast;
  if (typeof forecast === "number" && Number.isFinite(forecast)) {
    return { g: forecast, source: "forecast" };
  }
  return undefined;
}

export function parseCarbonIntensity(
  json: unknown,
  region: string = CARBON_INTENSITY_REGION,
): CarbonIntensityPeriod[] {
  const payload = json as CarbonIntensityApiResponse;
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  const out: CarbonIntensityPeriod[] = [];
  for (const period of rows) {
    const from = period.from ? asIso(period.from) : undefined;
    const to = period.to ? asIso(period.to) : undefined;
    const picked = pickValue(period);
    if (!from || !to || !picked) continue;
    out.push({
      region,
      intensityGPerKwh: picked.g,
      validFrom: from,
      validTo: to,
      source: picked.source,
    });
  }
  return out;
}

export function pickGridIntensity(
  rows: CarbonIntensityPeriod[],
  atIso: string,
  region: string = CARBON_INTENSITY_REGION,
): CarbonIntensityPeriod | undefined {
  const at = Date.parse(atIso);
  if (!Number.isFinite(at)) return undefined;
  return rows.find((row) => {
    if (row.region !== region) return false;
    const from = Date.parse(row.validFrom);
    const to = Date.parse(row.validTo);
    return Number.isFinite(from) && Number.isFinite(to) && from <= at && at < to;
  });
}

export function gridIntensityReason(row: CarbonIntensityPeriod | undefined): string {
  if (!row) {
    return `No grid carbon intensity for this leave time, so we used ${GRID_INTENSITY_FALLBACK_G} g/kWh.`;
  }
  const kind = row.source === "actual" ? "measured" : "forecast";
  return `Used the national GB ${kind} grid carbon intensity at leave time (${row.intensityGPerKwh} g/kWh).`;
}
