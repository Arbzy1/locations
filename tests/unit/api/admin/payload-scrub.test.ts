import { describe, expect, it } from "vitest";
import { clampAdminListLimit } from "@locations/api/admin-ops";
import {
  isAssignableOpsRole,
  isInviteOpsRole,
  lastAdminDemoteBlocked,
  payloadLooksLikeLocationPii,
  sanitizeJobError,
  scrubAuditMeta,
  wipeEmailMatches,
} from "@locations/api/admin-guards";

describe("last-admin guard", () => {
  it("blocks demoting the last admin and allows extra admins", () => {
    expect(
      lastAdminDemoteBlocked({ currentRole: "admin", nextRole: "user", adminCount: 1 }),
    ).toBe(true);
    expect(
      lastAdminDemoteBlocked({ currentRole: "admin", nextRole: "user", adminCount: 2 }),
    ).toBe(false);
    expect(
      lastAdminDemoteBlocked({ currentRole: "developer", nextRole: "user", adminCount: 1 }),
    ).toBe(false);
  });

  it("rejects demo as an assignable operator role", () => {
    expect(isAssignableOpsRole("demo")).toBe(false);
    expect(isAssignableOpsRole("admin")).toBe(true);
  });

  it("allows invite of user or developer only", () => {
    expect(isInviteOpsRole("user")).toBe(true);
    expect(isInviteOpsRole("developer")).toBe(true);
    expect(isInviteOpsRole("admin")).toBe(false);
    expect(isInviteOpsRole("demo")).toBe(false);
  });
});

describe("job error sanitizer", () => {
  it("redacts emails, urls, secrets, and coordinates, and caps length", () => {
    expect(sanitizeJobError("failed for a@example.com")).toBe("failed for [redacted]");
    expect(sanitizeJobError("see https://example.com/job")).toBe("see [url]");
    expect(sanitizeJobError("sk_live_abc failed")).toBe("Job failed");
    expect(sanitizeJobError("point 51.5074, -0.1278")).toBe("Job failed");
    expect(sanitizeJobError(null)).toBeNull();
    const long = "x".repeat(200);
    const out = sanitizeJobError(long);
    expect(out?.length).toBe(160);
    expect(out?.endsWith("...")).toBe(true);
  });
});

describe("wipe email confirm", () => {
  it("matches case-insensitively and rejects blanks", () => {
    expect(wipeEmailMatches("A@Example.com", "a@example.com")).toBe(true);
    expect(wipeEmailMatches("a@example.com", "other@example.com")).toBe(false);
    expect(wipeEmailMatches("", "")).toBe(false);
  });
});

describe("audit scrubber", () => {
  it("drops coordinates, email, and secret-like strings", () => {
    const meta = scrubAuditMeta({
      keys: ["signup_disabled"],
      count: 3,
      email: "a@example.com",
      lat: 51.5,
      token: "sk_test",
      ok: true,
    });
    expect(meta).toEqual({ keys: ["signup_disabled"], count: 3, ok: true });
    expect(payloadLooksLikeLocationPii({ lat: 51.5, lon: -0.1 })).toBe(true);
    expect(payloadLooksLikeLocationPii({ userId: "u1", visitCount: 4 })).toBe(false);
  });
});

describe("list limit cap", () => {
  it("caps pagination at 50", () => {
    expect(clampAdminListLimit(500)).toBe(50);
    expect(clampAdminListLimit(0)).toBe(1);
    expect(clampAdminListLimit(Number.NaN)).toBe(25);
  });
});
