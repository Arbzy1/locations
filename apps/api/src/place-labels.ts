import { PLACE_COLOR_TOKENS, type PlaceColorToken } from "@locations/db";

export { PLACE_COLOR_TOKENS, type PlaceColorToken };

const MAX_TAGS = 5;
const MAX_TAG_LEN = 24;

export type PlaceLabelPatch = {
  placeKey: string;
  label?: string;
  hidden?: boolean;
  favourite?: boolean;
  color?: PlaceColorToken | null;
  tags?: string[];
};

export function parsePlaceColor(raw: unknown): { ok: true; value: PlaceColorToken | null } | { ok: false } {
  if (raw === null || raw === "") return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false };
  if (!(PLACE_COLOR_TOKENS as readonly string[]).includes(raw)) return { ok: false };
  return { ok: true, value: raw as PlaceColorToken };
}

export function sanitizePlaceTags(raw: unknown): { ok: true; value: string[] } | { ok: false } {
  if (!Array.isArray(raw)) return { ok: false };
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") return { ok: false };
    const tag = item.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, MAX_TAG_LEN);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= MAX_TAGS) break;
  }
  return { ok: true, value: out };
}
