const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/gi;

/** Title-case an address for display. Never mutate stored source data. */
export function titleCaseAddress(raw: string): string {
  const titled = raw.toLowerCase().replace(/\b([a-z])/g, (ch) => ch.toUpperCase());
  return titled.replace(POSTCODE, (_, out: string, inward: string) => `${out.toUpperCase()} ${inward.toUpperCase()}`);
}

/** Short hours line for cheapest-fill cards. Never used as a filter. */
export function openingHoursSummary(json: unknown): string | undefined {
  if (!json || typeof json !== "object") return undefined;
  const days = (json as { usual_days?: Record<string, { open?: string; close?: string; is_24_hours?: boolean }> })
    .usual_days;
  if (!days) return undefined;
  const slots = Object.values(days);
  if (slots.length === 0) return undefined;
  if (slots.some((d) => d?.is_24_hours)) return "Open 24 hours";
  const first = slots.find((d) => d?.open && d?.close);
  if (first?.open && first?.close) {
    return `Typically ${first.open.slice(0, 5)}-${first.close.slice(0, 5)}`;
  }
  return "Hours listed";
}
