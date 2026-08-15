import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestApp, sessionUser } from "@tests/helpers/api-app";
import { testEnv } from "@tests/helpers/env";
import {
  parseResendCall,
  queueMessage,
  stubResendFetch,
} from "@tests/helpers/vendors";
import type { ImportQueueMessage } from "@locations/api/env";

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

import worker, { app } from "@locations/api/index";
import {
  emailForTenant,
  getImportJob,
  importSourceData,
  updateImportJob,
  wipeTenantData,
} from "@locations/api/services";

const r2Object = (text: string) => ({
  text: async () => text,
});

describe("product emails", () => {
  beforeEach(() => {
    getSession.mockReset();
    vi.mocked(wipeTenantData).mockReset();
    vi.mocked(emailForTenant).mockReset();
    vi.mocked(getImportJob).mockReset();
    vi.mocked(updateImportJob).mockReset();
    vi.mocked(importSourceData).mockReset();
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

  it("sends import_ready with counts only after a successful queue job", async () => {
    const fetchMock = stubResendFetch();
    const env = testEnv({ RESEND_API_KEY: "re_test" });
    vi.mocked(env.UPLOADS.get).mockResolvedValue(
      r2Object(JSON.stringify([{ visit: {} }])) as never,
    );
    vi.mocked(importSourceData).mockResolvedValue({ visitCount: 12, activityCount: 4 } as never);
    vi.mocked(getImportJob).mockResolvedValue({
      status: "ready",
      notifiedAt: null,
      visitCount: 12,
      activityCount: 4,
    } as never);
    const msg = queueMessage<ImportQueueMessage>({
      jobId: "job-1",
      tenant: "user-a",
      userId: "user-a",
      r2Key: "uploads/user-a/job-1.json",
      sourceId: "src-1",
    });
    await worker.queue({ messages: [msg] } as never, env);
    const { body, headers } = parseResendCall(fetchMock);
    expect(body.tags[0].value).toBe("import_ready");
    expect(body.text).toContain("12 visits");
    expect(body.text).toContain("4 journeys");
    expect(body.text).not.toMatch(/40\.7|-74/);
    expect(headers["Idempotency-Key"]).toBe("import:job-1");
    expect(env.UPLOADS.delete).toHaveBeenCalledWith("uploads/user-a/job-1.json");
    expect(updateImportJob).toHaveBeenCalledWith(
      expect.anything(),
      "job-1",
      expect.objectContaining({ notifiedAt: expect.any(Date) }),
      "user-a",
    );
    expect(msg.ack).toHaveBeenCalled();
  });

  it("sends import_failed when the uploaded object is missing", async () => {
    const fetchMock = stubResendFetch();
    const env = testEnv({ RESEND_API_KEY: "re_test" });
    vi.mocked(env.UPLOADS.get).mockResolvedValue(null);
    vi.mocked(getImportJob).mockResolvedValue({
      status: "error",
      notifiedAt: null,
    } as never);
    const msg = queueMessage<ImportQueueMessage>({
      jobId: "job-miss",
      tenant: "user-a",
      userId: "user-a",
      r2Key: "uploads/user-a/job-miss.json",
      sourceId: "src-1",
    });
    await worker.queue({ messages: [msg] } as never, env);
    expect(parseResendCall(fetchMock).body.tags[0].value).toBe("import_failed");
    expect(env.UPLOADS.delete).toHaveBeenCalledWith("uploads/user-a/job-miss.json");
    expect(msg.ack).toHaveBeenCalled();
  });

  it("does not mark notifiedAt when Resend returns 500", async () => {
    stubResendFetch({ status: 500, body: "down" });
    const env = testEnv({ RESEND_API_KEY: "re_test" });
    vi.mocked(env.UPLOADS.get).mockResolvedValue(r2Object("[]") as never);
    vi.mocked(importSourceData).mockResolvedValue({ visitCount: 1, activityCount: 0 } as never);
    vi.mocked(getImportJob).mockResolvedValue({
      status: "ready",
      notifiedAt: null,
      visitCount: 1,
      activityCount: 0,
    } as never);
    await worker.queue(
      {
        messages: [
          queueMessage<ImportQueueMessage>({
            jobId: "job-fail-mail",
            tenant: "user-a",
            userId: "user-a",
            r2Key: "uploads/user-a/job-fail-mail.json",
            sourceId: "src-1",
          }),
        ],
      } as never,
      env,
    );
    expect(updateImportJob).not.toHaveBeenCalledWith(
      expect.anything(),
      "job-fail-mail",
      expect.objectContaining({ notifiedAt: expect.anything() }),
      "user-a",
    );
    expect(env.UPLOADS.delete).toHaveBeenCalled();
  });

  it("skips import mail for demo recipients", async () => {
    const fetchMock = stubResendFetch();
    vi.mocked(emailForTenant).mockResolvedValue({
      email: "demo@locations.app",
      role: "demo",
    });
    const env = testEnv({
      RESEND_API_KEY: "re_test",
      DEMO_EMAIL: "demo@locations.app",
    });
    vi.mocked(env.UPLOADS.get).mockResolvedValue(r2Object("[]") as never);
    vi.mocked(importSourceData).mockResolvedValue({ visitCount: 1, activityCount: 0 } as never);
    vi.mocked(getImportJob).mockResolvedValue({
      status: "ready",
      notifiedAt: null,
      visitCount: 1,
      activityCount: 0,
    } as never);
    await worker.queue(
      {
        messages: [
          queueMessage<ImportQueueMessage>({
            jobId: "job-demo",
            tenant: "demo",
            userId: "demo-1",
            r2Key: "uploads/demo-1/job-demo.json",
            sourceId: "src-1",
          }),
        ],
      } as never,
      env,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
