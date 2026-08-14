import { afterEach, describe, expect, it, vi } from "vitest";
import { EMAIL_KINDS } from "./kinds";
import { escapeHtml, renderEmail } from "./templates";
import { sendEmail } from "./send";
import type { Env } from "../env";

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

describe("escapeHtml", () => {
  it("escapes markup", () => {
    expect(escapeHtml(`<a href="x">y</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;y&lt;/a&gt;");
  });
});

describe("renderEmail", () => {
  it("covers every kind without coordinates or place payloads", () => {
    const blobs: string[] = [];
    for (const kind of EMAIL_KINDS) {
      const rendered = renderEmail(kind, {
        url: "https://locations.aden.website/verify",
        otp: "123456",
        visitCount: 12,
        activityCount: 4,
        siteUrl: "https://locations.aden.website",
      });
      expect(rendered.subject.length).toBeGreaterThan(4);
      expect(rendered.text.length).toBeGreaterThan(10);
      expect(rendered.html).toContain("Privacy");
      blobs.push(rendered.subject, rendered.text, rendered.html);
    }
    const joined = blobs.join("\n");
    expect(joined).not.toMatch(COORD_RE);
    expect(joined.toLowerCase()).not.toContain("takeout");
    expect(joined.toLowerCase()).not.toMatch(/\blat\b/);
    expect(joined.toLowerCase()).not.toMatch(/\blon\b/);
  });

  it("import_ready includes counts only", () => {
    const rendered = renderEmail("import_ready", { visitCount: 12, activityCount: 4 });
    expect(rendered.text).toContain("12 visits");
    expect(rendered.text).toContain("4 journeys");
    expect(rendered.text).not.toMatch(COORD_RE);
    expect(rendered.html).not.toMatch(/51\.\d+/);
  });
});

describe("sendEmail", () => {
  it("skips without a key and does not log the recipient", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const result = await sendEmail(env, {
      kind: "verify_email_link",
      to: "person@example.com",
      vars: { url: "https://locations.aden.website/x" },
    });
    expect(result).toBe("skipped");
    const logged = info.mock.calls.map((c) => String(c[0])).join(" ");
    expect(logged).toContain("email_skipped");
    expect(logged).toContain("verify_email_link");
    expect(logged).not.toContain("person@example.com");
  });

  it("skips demo even when a key is set", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await sendEmail(
      { ...env, RESEND_API_KEY: "re_test" },
      { kind: "magic_link", to: "demo@locations.app", isDemo: true },
    );
    expect(result).toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts to Resend when a key is set", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await sendEmail(
      { ...env, RESEND_API_KEY: "re_test", EMAIL_FROM: "Locations <noreply@aden.website>" },
      {
        kind: "import_ready",
        to: "person@example.com",
        vars: { visitCount: 3, activityCount: 1 },
        idempotencyKey: "job-1",
      },
    );
    expect(result).toBe("sent");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    const headers = init.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe("job-1");
    const body = JSON.parse(String(init.body)) as { to: string[]; subject: string; tags: { value: string }[] };
    expect(body.to).toEqual(["person@example.com"]);
    expect(body.tags[0].value).toBe("import_ready");
    expect(body.subject).toContain("import");
  });
});
