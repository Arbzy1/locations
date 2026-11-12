import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestApp, sessionUser } from "@tests/helpers/api-app";
import { testEnv, testExecutionCtx } from "@tests/helpers/env";
import { flushWaitUntil, parseResendCall, stubResendFetch } from "@tests/helpers/vendors";
import type { Env } from "@locations/api/env";

const getSession = vi.fn();

vi.mock("@locations/api/auth", () => ({
  createAuth: () => ({
    handler: async () => new Response("auth"),
    api: { getSession: (...args: unknown[]) => getSession(...args) },
  }),
}));

vi.mock("@locations/api/services", async () => {
  const { createServicesMock } = await import("@tests/helpers/api-app");
  return createServicesMock();
});

vi.mock("@locations/api/import-session", async () => {
  const { createImportSessionMock } = await import("@tests/helpers/import-session-mock");
  return createImportSessionMock();
});

import { app } from "@locations/api/index";
import { emailForTenant, getImportJob, updateImportJob, wipeTenantData } from "@locations/api/services";
import { openImportJob } from "@locations/api/import-session";

/** Finish a browser import and wait for the notification the route sends afterwards. */
async function finishImport(env: Env, jobId: string) {
  vi.mocked(openImportJob).mockResolvedValue({ id: jobId, sourceId: "src-1", status: "processing" } as never);
  const ctx = testExecutionCtx();
  const res = await requestApp(
    app,
    `/api/import/${jobId}/finish`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
    env,
    ctx,
  );
  await flushWaitUntil(ctx);
  return res;
}

describe("product emails", () => {
  beforeEach(() => {
    getSession.mockReset();
    vi.mocked(wipeTenantData).mockReset();
    vi.mocked(emailForTenant).mockReset();
    vi.mocked(getImportJob).mockReset();
    vi.mocked(updateImportJob).mockReset();
    vi.mocked(openImportJob).mockReset();
    vi.mocked(emailForTenant).mockResolvedValue({ email: "a@example.com", role: "user" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends account_deleted without logging the recipient", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const fetchMock = stubResendFetch();
    getSession.mockResolvedValue(sessionUser({ id: "user-a", email: "a@example.com" }));
    const env = testEnv({ RESEND_API_KEY: "re_test" });
    vi.mocked(env.UPLOADS.list).mockResolvedValue({ objects: [], truncated: false } as never);
    const res = await requestApp(app, "/api/account/delete", { method: "POST" }, env);
    expect(res.status).toBe(200);
    const { url, body } = parseResendCall(fetchMock);
    expect(url).toBe("https://api.resend.com/emails");
    expect(body.tags[0].value).toBe("account_deleted");
    expect(body.text.toLowerCase()).not.toMatch(/\blat\b|\blon\b|takeout/);
    const logged = info.mock.calls.map((c) => String(c[0])).join(" ");
    expect(logged).toContain("email_sent");
    expect(logged).not.toContain("a@example.com");
  });

  it("skips account_deleted when Resend is unset", async () => {
    const fetchMock = stubResendFetch();
    getSession.mockResolvedValue(sessionUser({ id: "user-a", email: "a@example.com" }));
    const env = testEnv();
    vi.mocked(env.UPLOADS.list).mockResolvedValue({ objects: [], truncated: false } as never);
    const res = await requestApp(app, "/api/account/delete", { method: "POST" }, env);
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends import_ready with counts only after a browser import finishes", async () => {
    const fetchMock = stubResendFetch();
    getSession.mockResolvedValue(sessionUser({ id: "user-a", email: "a@example.com" }));
    const env = testEnv({ RESEND_API_KEY: "re_test" });
    vi.mocked(getImportJob).mockResolvedValue({
      status: "ready",
      notifiedAt: null,
      visitCount: 12,
      activityCount: 4,
    } as never);
    const res = await finishImport(env, "job-1");
    expect(res.status).toBe(200);
    const { body, headers } = parseResendCall(fetchMock);
    expect(body.tags[0].value).toBe("import_ready");
    expect(body.text).toContain("12 visits");
    expect(body.text).toContain("4 journeys");
    expect(body.text).not.toMatch(/40\.7|-74/);
    expect(headers["Idempotency-Key"]).toBe("import:job-1");
    expect(updateImportJob).toHaveBeenCalledWith(
      expect.anything(),
      "job-1",
      expect.objectContaining({ notifiedAt: expect.any(Date) }),
      "user-a",
    );
  });

  it("does not mark notifiedAt when Resend returns 500", async () => {
    stubResendFetch({ status: 500, body: "down" });
    getSession.mockResolvedValue(sessionUser({ id: "user-a", email: "a@example.com" }));
    const env = testEnv({ RESEND_API_KEY: "re_test" });
    vi.mocked(getImportJob).mockResolvedValue({
      status: "ready",
      notifiedAt: null,
      visitCount: 1,
      activityCount: 0,
    } as never);
    await finishImport(env, "job-fail-mail");
    expect(updateImportJob).not.toHaveBeenCalledWith(
      expect.anything(),
      "job-fail-mail",
      expect.objectContaining({ notifiedAt: expect.anything() }),
      "user-a",
    );
  });

  it("skips import mail for demo recipients", async () => {
    const fetchMock = stubResendFetch();
    getSession.mockResolvedValue(sessionUser({ id: "user-a", email: "a@example.com" }));
    vi.mocked(emailForTenant).mockResolvedValue({
      email: "demo@locations.app",
      role: "demo",
    });
    const env = testEnv({
      RESEND_API_KEY: "re_test",
      DEMO_EMAIL: "demo@locations.app",
    });
    vi.mocked(getImportJob).mockResolvedValue({
      status: "ready",
      notifiedAt: null,
      visitCount: 1,
      activityCount: 0,
    } as never);
    await finishImport(env, "job-demo");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
