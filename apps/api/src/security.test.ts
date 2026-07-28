import { describe, expect, it, beforeEach } from "vitest";
import { corsOriginFor, allowedOrigins } from "./cors";
import { rateLimit, resetRateLimits } from "./rate-limit";
import { sniffTimelineJson } from "./upload-sniff";
import { applySecurityHeaders } from "./security-headers";
import type { Env } from "./env";

const env = {
  BETTER_AUTH_URL: "https://locations.aden.website",
  DATABASE_URL: "postgres://x",
  BETTER_AUTH_SECRET: "x",
} as Env;

describe("cors allowlist", () => {
  it("allows BETTER_AUTH_URL and local Vite/API origins", () => {
    expect(allowedOrigins(env)).toContain("https://locations.aden.website");
    expect(corsOriginFor(env, "http://localhost:5173")).toBe("http://localhost:5173");
    expect(corsOriginFor(env, "https://locations.aden.website")).toBe(
      "https://locations.aden.website",
    );
  });

  it("rejects arbitrary origins", () => {
    expect(corsOriginFor(env, "https://evil.example")).toBeNull();
    expect(corsOriginFor(env, "https://locations.aden.website.evil.com")).toBeNull();
  });
});

describe("rateLimit", () => {
  beforeEach(() => resetRateLimits());

  it("allows up to the limit then blocks", () => {
    const key = "test:ip";
    expect(rateLimit({ key, limit: 2, windowMs: 60_000, now: 1000 }).ok).toBe(true);
    expect(rateLimit({ key, limit: 2, windowMs: 60_000, now: 1001 }).ok).toBe(true);
    const blocked = rateLimit({ key, limit: 2, windowMs: 60_000, now: 1002 });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("resets after the window", () => {
    const key = "test:reset";
    rateLimit({ key, limit: 1, windowMs: 1000, now: 0 });
    expect(rateLimit({ key, limit: 1, windowMs: 1000, now: 500 }).ok).toBe(false);
    expect(rateLimit({ key, limit: 1, windowMs: 1000, now: 1000 }).ok).toBe(true);
  });
});

describe("sniffTimelineJson", () => {
  it("accepts a JSON array", () => {
    const buf = new TextEncoder().encode('[{"visit":{}}]').buffer;
    const result = sniffTimelineJson(buf);
    expect(result.ok).toBe(true);
  });

  it("rejects zip magic bytes", () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
    const result = sniffTimelineJson(bytes.buffer);
    expect(result.ok).toBe(false);
  });

  it("rejects non-JSON text", () => {
    const buf = new TextEncoder().encode("not json").buffer;
    const result = sniffTimelineJson(buf);
    expect(result.ok).toBe(false);
  });
});

describe("applySecurityHeaders", () => {
  it("sets baseline headers and report-only CSP", () => {
    const headers = new Headers();
    applySecurityHeaders(headers, { isProductionHttps: true, noStore: true });
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Content-Security-Policy-Report-Only")).toContain("frame-ancestors 'none'");
    expect(headers.get("Strict-Transport-Security")).toContain("max-age=");
    expect(headers.get("Cache-Control")).toBe("no-store, private");
  });
});
