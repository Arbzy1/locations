import { beforeEach, describe, expect, it } from "vitest";
import { rateLimit, resetRateLimits } from "@locations/api/rate-limit";

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
