/** Plausible UK pump prices, pence per litre. Spec §7.2. */
export const MIN_PPL = 60;
export const MAX_PPL = 300;

/**
 * Parse a Fuel Finder price into pence per litre.
 * Handles pounds (`1.339`, values below 2), pence (`133.9`, `"0120.0000"`),
 * and tenths of a penny (`1339`).
 */
export function parsePriceToPpl(raw: string | number | null | undefined): number | undefined {
  if (raw === null || raw === undefined || raw === "") return undefined;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n) || n <= 0) return undefined;

  let ppl = n;
  if (n < 6) ppl = n * 100;
  else if (n > MAX_PPL && n <= MAX_PPL * 10) ppl = n / 10;

  if (ppl < MIN_PPL || ppl > MAX_PPL) return undefined;
  return ppl;
}

export function pplToTenths(ppl: number): number {
  return Math.round(ppl * 10);
}

export function tenthsToPpl(tenths: number): number {
  return tenths / 10;
}
