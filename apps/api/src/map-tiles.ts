import type { MapBookmark } from "@locations/db";

export type { MapBookmark };

/** Allowlisted custom raster XYZ templates and MapLibre bookmark payloads. */

export const MAX_MAP_BOOKMARKS = 20;

export function parseCustomTileHosts(raw?: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function hostnameFromHttpsUrl(raw?: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return null;
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Extra CSP hosts from custom tiles and env vector style URLs. */
export function extraCspHostsFromEnv(env: {
  MAP_CUSTOM_TILE_HOSTS?: string;
  MAP_STYLE_DARK_URL?: string;
  MAP_STYLE_LIGHT_URL?: string;
}): string[] {
  const hosts = [...parseCustomTileHosts(env.MAP_CUSTOM_TILE_HOSTS)];
  for (const raw of [env.MAP_STYLE_DARK_URL, env.MAP_STYLE_LIGHT_URL]) {
    const host = hostnameFromHttpsUrl(raw);
    if (host) hosts.push(host);
  }
  return [...new Set(hosts)];
}

function hostAllowed(hostname: string, allowed: string[]): boolean {
  const host = hostname.toLowerCase();
  return allowed.some((entry) => {
    const e = entry.toLowerCase();
    if (e.startsWith("*.")) {
      const base = e.slice(2);
      return host === base || host.endsWith(`.${base}`);
    }
    return host === e;
  });
}

/** CSP img-src / connect-src fragments for extra tile hosts. */
export function cspSourcesForHosts(hosts: string[]): string {
  return hosts
    .map((h) => (h.startsWith("*.") ? `https://${h}` : `https://${h}`))
    .join(" ");
}

export function validateTileTemplate(
  url: string,
  allowedHosts: string[],
): { ok: true; url: string } | { ok: false; error: string } {
  const trimmed = url.trim();
  if (!trimmed) return { ok: true, url: "" };
  if (allowedHosts.length === 0) {
    return { ok: false, error: "Custom tile URLs are not enabled on this host" };
  }
  if (trimmed.length > 500) return { ok: false, error: "Tile URL is too long" };
  let parsed: URL;
  try {
    parsed = new URL(trimmed.replaceAll("{s}", "a"));
  } catch {
    return { ok: false, error: "Invalid tile URL" };
  }
  if (parsed.protocol !== "https:") return { ok: false, error: "Tile URL must be https" };
  if (parsed.username || parsed.password) {
    return { ok: false, error: "Tile URL must not include credentials" };
  }
  if (!hostAllowed(parsed.hostname, allowedHosts)) {
    return { ok: false, error: "Tile host is not on the allowlist" };
  }
  if (!/\{z\}/i.test(trimmed) || !/\{x\}/i.test(trimmed) || !/\{y\}/i.test(trimmed)) {
    return { ok: false, error: "Tile URL must include {z}, {x}, and {y}" };
  }
  return { ok: true, url: trimmed };
}

function finiteNumber(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

export function sanitizeBookmarks(input: unknown): MapBookmark[] | { error: string } {
  if (!Array.isArray(input)) return { error: "Bookmarks must be a list" };
  if (input.length > MAX_MAP_BOOKMARKS) {
    return { error: `At most ${MAX_MAP_BOOKMARKS} saved views` };
  }
  const out: MapBookmark[] = [];
  for (const row of input) {
    if (!row || typeof row !== "object") return { error: "Invalid saved view" };
    const r = row as Record<string, unknown>;
    const id = typeof r.id === "string" && r.id.length > 0 && r.id.length <= 64 ? r.id : null;
    const name =
      typeof r.name === "string" ? r.name.trim().slice(0, 40) : "";
    const lng = finiteNumber(r.lng, -180, 180);
    const lat = finiteNumber(r.lat, -90, 90);
    const zoom = finiteNumber(r.zoom, 0, 22);
    const pitch = finiteNumber(r.pitch, 0, 85);
    const bearing = finiteNumber(r.bearing, -180, 360);
    if (!id || !name || lng == null || lat == null || zoom == null || pitch == null || bearing == null) {
      return { error: "Invalid saved view" };
    }
    out.push({ id, name, lng, lat, zoom, pitch, bearing });
  }
  return out;
}
