import { describe, expect, it } from "vitest";
import { isStaffRole, tenantForUser } from "@locations/db";
import { blockDemo, isDemoBlockedAuthPath } from "@locations/api/guards";

describe("tenantForUser", () => {
  it("maps demo role to the demo tenant", () => {
    expect(tenantForUser({ id: "user-1", role: "demo" })).toBe("demo");
  });

  it("uses the user id for non-demo roles", () => {
    expect(tenantForUser({ id: "user-1", role: "user" })).toBe("user-1");
    expect(tenantForUser({ id: "user-1", role: "admin" })).toBe("user-1");
    expect(tenantForUser({ id: "user-1", role: "developer" })).toBe("user-1");
    expect(tenantForUser({ id: "user-1", role: null })).toBe("user-1");
    expect(tenantForUser({ id: "user-1" })).toBe("user-1");
  });
});

describe("isStaffRole", () => {
  it("is true for admin and developer only", () => {
    expect(isStaffRole("admin")).toBe(true);
    expect(isStaffRole("developer")).toBe(true);
    expect(isStaffRole("user")).toBe(false);
    expect(isStaffRole("demo")).toBe(false);
    expect(isStaffRole(null)).toBe(false);
    expect(isStaffRole(undefined)).toBe(false);
  });
});

describe("blockDemo", () => {
  it("blocks demo accounts from mutating data sources", () => {
    expect(
      blockDemo({
        id: "demo-user",
        email: "demo@locations.app",
        name: "Demo",
        role: "demo",
      }),
    ).toEqual({
      error: "Demo accounts cannot import or manage data sources",
    });
  });

  it("allows non-demo users", () => {
    expect(
      blockDemo({
        id: "user-1",
        email: "a@example.com",
        name: "A",
        role: "user",
      }),
    ).toBeNull();
    expect(blockDemo(null)).toBeNull();
  });
});

describe("isDemoBlockedAuthPath", () => {
  it("covers Better Auth account mutations", () => {
    for (const path of [
      "/api/auth/change-password",
      "/api/auth/change-email",
      "/api/auth/update-user",
      "/api/auth/delete-user",
      "/api/auth/change-password/",
      "/api/auth/revoke-session",
      "/api/auth/revoke-other-sessions",
    ]) {
      expect(isDemoBlockedAuthPath("POST", path)).toBe(true);
    }
  });

  it("hides the shared session list", () => {
    expect(isDemoBlockedAuthPath("GET", "/api/auth/list-sessions")).toBe(true);
  });

  it("leaves sign-in, sign-out, and the current session alone", () => {
    expect(isDemoBlockedAuthPath("POST", "/api/auth/sign-in/email")).toBe(false);
    expect(isDemoBlockedAuthPath("POST", "/api/auth/sign-out")).toBe(false);
    expect(isDemoBlockedAuthPath("GET", "/api/auth/get-session")).toBe(false);
    expect(isDemoBlockedAuthPath("GET", "/api/auth/change-password")).toBe(false);
  });
});
