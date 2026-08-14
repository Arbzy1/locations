import { describe, expect, it } from "vitest";
import { applySecurityHeaders } from "@locations/api/security-headers";

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

  it("enforces CSP when requested", () => {
    const headers = new Headers();
    applySecurityHeaders(headers, { isProductionHttps: false, noStore: false, enforceCsp: true });
    expect(headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(headers.get("Content-Security-Policy-Report-Only")).toBeNull();
  });
});
