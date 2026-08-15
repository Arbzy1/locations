import { afterEach, describe, expect, it, vi } from "vitest";
import { EMAIL_KINDS } from "@locations/api/email/kinds";
import { renderEmail } from "@locations/api/email/templates";
import { sendEmail } from "@locations/api/email/send";
import type { Env } from "@locations/api/env";

const env = {
  BETTER_AUTH_URL: "https://locations.aden.website",
  DATABASE_URL: "postgres://x",
  BETTER_AUTH_SECRET: "x",
} as Env;

const COORD_RE = /\b-?\d{1,3}\.\d{3,},\s*-?\d{1,3}\.\d{3,}\b/;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("email privacy", () => {
  it("renders every kind without coordinates, place names, or Takeout", () => {
    const blobs: string[] = [];
    for (const kind of EMAIL_KINDS) {
      const rendered = renderEmail(kind, {
        url: "https://locations.aden.website/verify",
        otp: "123456",
        visitCount: 12,
        daysTracked: 11,
        activityCount: 6,
        distanceLabel: "12 mi",
        monthLabel: "July 2026",
        siteUrl: "https://locations.aden.website",
      });
      blobs.push(rendered.subject, rendered.text, rendered.html);
    }
    const joined = blobs.join("\n");
    expect(joined).not.toMatch(COORD_RE);
    expect(joined.toLowerCase()).not.toContain("takeout");
    expect(joined.toLowerCase()).not.toMatch(/\blat\b/);
    expect(joined.toLowerCase()).not.toMatch(/\blon\b/);
    expect(joined.toLowerCase()).not.toMatch(/you visited/);
  });

  it("logs kind and ok, never the recipient", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await sendEmail(env, {
      kind: "verify_email_link",
      to: "person@example.com",
      vars: { url: "https://locations.aden.website/x" },
    });
    const logged = info.mock.calls.map((c) => String(c[0])).join(" ");
    expect(logged).toContain('"kind":"verify_email_link"');
    expect(logged).not.toContain("person@example.com");
    expect(logged).not.toMatch(/"to"/);
  });
});
