import { describe, expect, it } from "vitest";
import { formatSessionTime, summarizeUserAgent } from "@locations/web/lib/sessions";

describe("summarizeUserAgent", () => {
  it("labels Chrome on Windows", () => {
    expect(
      summarizeUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      ),
    ).toBe("Chrome on Windows");
  });

  it("labels Safari on macOS, not Chrome", () => {
    expect(
      summarizeUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      ),
    ).toBe("Safari on macOS");
  });

  it("labels Edge instead of Chrome", () => {
    expect(
      summarizeUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
      ),
    ).toBe("Edge on Windows");
  });

  it("falls back when the user agent is missing", () => {
    expect(summarizeUserAgent(null)).toBe("Unknown device");
    expect(summarizeUserAgent("")).toBe("Unknown device");
  });
});

describe("formatSessionTime", () => {
  it("formats a valid date", () => {
    const label = formatSessionTime("2026-08-15T12:00:00.000Z");
    expect(label).not.toBe("Unknown time");
    expect(label.length).toBeGreaterThan(4);
  });

  it("returns unknown for invalid input", () => {
    expect(formatSessionTime("not-a-date")).toBe("Unknown time");
  });
});
