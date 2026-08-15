const COORD_KEY = /^(lat|lon|lng|latitude|longitude|cluster|placeId|place_id|placeName|place_name|geometry|coordinates)$/i;
const SECRETISH = /\b(sk_|whsec_|re_[A-Za-z0-9]|BEGIN [A-Z ]+PRIVATE KEY)/;

export const ALLOWED_OPS_ROLES = ["user", "admin", "developer"] as const;
export type OpsAssignableRole = (typeof ALLOWED_OPS_ROLES)[number];

export function isAssignableOpsRole(role: string): role is OpsAssignableRole {
  return (ALLOWED_OPS_ROLES as readonly string[]).includes(role);
}

export function lastAdminDemoteBlocked(opts: {
  currentRole: string | null | undefined;
  nextRole: string;
  adminCount: number;
}): boolean {
  if (opts.currentRole !== "admin") return false;
  if (opts.nextRole === "admin") return false;
  return opts.adminCount <= 1;
}

export function wipeEmailMatches(stored: string | null | undefined, submitted: string | null | undefined): boolean {
  const a = stored?.trim().toLowerCase() ?? "";
  const b = submitted?.trim().toLowerCase() ?? "";
  return a.length > 0 && a === b;
}

export function scrubAuditMeta(meta: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!meta) return out;
  for (const [key, value] of Object.entries(meta)) {
    if (COORD_KEY.test(key)) continue;
    if (key === "email" || key === "to" || key === "token" || key === "r2Key" || key === "password") continue;
    if (typeof value === "string" && SECRETISH.test(value)) continue;
    if (typeof value === "number" || typeof value === "boolean" || value === null) {
      out[key] = value;
      continue;
    }
    if (Array.isArray(value) && value.every((item) => typeof item === "string" && item.length < 80)) {
      out[key] = value;
      continue;
    }
    if (typeof value === "string" && value.length < 200) {
      out[key] = value;
    }
  }
  return out;
}

export function payloadLooksLikeLocationPii(value: unknown): boolean {
  const seen = new Set<unknown>();
  const walk = (node: unknown): boolean => {
    if (node === null || node === undefined) return false;
    if (typeof node === "string") {
      return SECRETISH.test(node);
    }
    if (typeof node !== "object") return false;
    if (seen.has(node)) return false;
    seen.add(node);
    if (Array.isArray(node)) return node.some(walk);
    const rec = node as Record<string, unknown>;
    for (const key of Object.keys(rec)) {
      if (COORD_KEY.test(key)) return true;
      if (walk(rec[key])) return true;
    }
    const lat = rec.lat ?? rec.latitude;
    const lon = rec.lon ?? rec.lng ?? rec.longitude;
    if (typeof lat === "number" && typeof lon === "number") return true;
    return false;
  };
  return walk(value);
}

export function escapeLikePrefix(raw: string): string {
  return raw.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
