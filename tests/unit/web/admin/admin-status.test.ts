import { describe, expect, it } from "vitest";
import {
  billingStatus,
  boolStatus,
  jobStatus,
  roleStatus,
  sourceStatus,
} from "@locations/web/lib/admin/admin-status";
import { adminPageLabel } from "@locations/web/components/admin/adminNav";

describe("admin status labels", () => {
  it("maps roles to badges", () => {
    expect(roleStatus("admin")).toEqual({ label: "Admin", tone: "warn" });
    expect(roleStatus("developer")).toEqual({ label: "Developer", tone: "ok" });
    expect(roleStatus("demo")).toEqual({ label: "Demo", tone: "neutral" });
    expect(roleStatus("user")).toEqual({ label: "User", tone: "neutral" });
  });

  it("maps billing and job statuses without raw booleans", () => {
    expect(billingStatus("active").tone).toBe("ok");
    expect(billingStatus("past_due")).toEqual({ label: "past due", tone: "danger" });
    expect(jobStatus("ready")).toEqual({ label: "Ready", tone: "ok" });
    expect(jobStatus("error")).toEqual({ label: "Error", tone: "danger" });
    expect(jobStatus("pending")).toEqual({ label: "Pending", tone: "warn" });
  });

  it("maps flags, sources, and missing config", () => {
    expect(boolStatus(true)).toEqual({ label: "Yes", tone: "ok" });
    expect(boolStatus(false, "Configured", "Missing", "warn")).toEqual({
      label: "Missing",
      tone: "warn",
    });
    expect(sourceStatus("db")).toEqual({ label: "Database", tone: "warn" });
    expect(sourceStatus("env")).toEqual({ label: "Environment", tone: "neutral" });
  });
});

describe("admin page titles", () => {
  it("uses nav labels for the document title", () => {
    expect(adminPageLabel("/admin")).toBe("Overview");
    expect(adminPageLabel("/admin/flags")).toBe("Flags");
    expect(adminPageLabel("/admin/users/abc")).toBe("User");
  });
});
