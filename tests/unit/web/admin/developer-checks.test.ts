import { describe, expect, it } from "vitest";
import { DEVELOPER_SAFE_CHECKS, responseFailsPrivacy, summarizeCheckBody } from "@locations/web/lib/admin-checks";

describe("developer check catalog", () => {
  it("only lists GET-safe admin and public URLs", () => {
    expect(DEVELOPER_SAFE_CHECKS.length).toBeGreaterThan(8);
    for (const check of DEVELOPER_SAFE_CHECKS) {
      expect(check.url.startsWith("/api/")).toBe(true);
      expect(check.url).not.toMatch(/wipe|role|revoke/i);
    }
  });

  it("fails bodies that look like coordinates or secrets", () => {
    expect(responseFailsPrivacy('{"lat":51.5}')).toBe(true);
    expect(responseFailsPrivacy('{"ok":true,"sk_live":"x"}')).toBe(true);
    expect(summarizeCheckBody('{"worker":true,"db":true}').ok).toBe(true);
  });
});
