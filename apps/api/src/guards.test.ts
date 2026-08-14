import { describe, expect, it } from "vitest";
import { isStaffRole, tenantForUser } from "@locations/db";
import { blockDemo } from "./guards";

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
