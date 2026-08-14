export interface SunTimes {
  sunrise: Date | null;
  sunset: Date | null;
}

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const ZENITH_DEG = 90.833;

function normalize360(value: number): number {
  return ((value % 360) + 360) % 360;
}

function timeFor(
  rising: boolean,
  year: number,
  month: number,
  day: number,
  lat: number,
  lon: number,
): Date | null {
  const n1 = Math.floor((275 * month) / 9);
  const n2 = Math.floor((month + 9) / 12);
  const n3 = 1 + Math.floor((year - 4 * Math.floor(year / 4) + 2) / 3);
  const n = n1 - n2 * n3 + day - 30;
  const lngHour = lon / 15;
  const t = rising ? n + (6 - lngHour) / 24 : n + (18 - lngHour) / 24;

  const mAnom = 0.9856 * t - 3.289;
  let l = mAnom + 1.916 * Math.sin(mAnom * RAD) + 0.02 * Math.sin(2 * mAnom * RAD) + 282.634;
  l = normalize360(l);

  let ra = Math.atan(0.91764 * Math.tan(l * RAD)) * DEG;
  ra = normalize360(ra);
  const lQuad = Math.floor(l / 90) * 90;
  const raQuad = Math.floor(ra / 90) * 90;
  ra = (ra + (lQuad - raQuad)) / 15;

  const sinDec = 0.39782 * Math.sin(l * RAD);
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosH =
    (Math.cos(ZENITH_DEG * RAD) - sinDec * Math.sin(lat * RAD)) / (cosDec * Math.cos(lat * RAD));
  if (cosH > 1 || cosH < -1) return null;

  let h = rising ? 360 - Math.acos(cosH) * DEG : Math.acos(cosH) * DEG;
  h /= 15;
  const tLocal = h + ra - 0.06571 * t - 6.622;
  let ut = tLocal - lngHour;
  ut = ((ut % 24) + 24) % 24;
  return new Date(Date.UTC(year, month - 1, day) + ut * 3600000);
}

/**
 * Approximate sunrise/sunset (NOAA / USNO algorithm) for a UTC calendar date.
 * Returns null rise/set in polar day or night. No network.
 */
export function sunTimes(lat: number, lon: number, date: string): SunTimes {
  const parts = date.split('-').map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (!year || !month || !day) return { sunrise: null, sunset: null };
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { sunrise: null, sunset: null };

  return {
    sunrise: timeFor(true, year, month, day, lat, lon),
    sunset: timeFor(false, year, month, day, lat, lon),
  };
}
