/**
 * Fixed-window rate limiter for Cloudflare Workers.
 * In-memory per isolate: good for wrangler dev and soft limits in production.
 * Pair with Cloudflare Rate Limiting / WAF for hard edge enforcement.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

const MAX_KEYS = 10_000;

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

export function rateLimit(opts: {
  key: string;
  limit: number;
  windowMs: number;
  now?: number;
}): RateLimitResult {
  const now = opts.now ?? Date.now();

  if (buckets.size > MAX_KEYS) {
    for (const [k, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(k);
    }
    if (buckets.size > MAX_KEYS) buckets.clear();
  }

  const existing = buckets.get(opts.key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(opts.key, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true };
  }

  if (existing.count >= opts.limit) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return { ok: true };
}

/** Test helper: clear all buckets. */
export function resetRateLimits(): void {
  buckets.clear();
}

export function clientIp(headers: Headers): string {
  return (
    headers.get("cf-connecting-ip") ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  );
}
