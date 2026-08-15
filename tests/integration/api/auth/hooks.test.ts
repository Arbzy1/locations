import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestApp, sessionUser } from "@tests/helpers/api-app";
import { testEnv, testExecutionCtx } from "@tests/helpers/env";
import { flushWaitUntil, parseResendCall, stubResendFetch } from "@tests/helpers/vendors";
import { resetRateLimits } from "@locations/api/rate-limit";

const getSession = vi.fn();
const revokeOtherSessions = vi.fn(async () => undefined);
const handler = vi.fn(async () => new Response("ok", { status: 200 }));

vi.mock("@locations/api/auth", () => ({
  createAuth: () => ({
    handler: (...args: unknown[]) => handler(...args),
    api: {
      getSession: (...args: unknown[]) => getSession(...args),
      revokeOtherSessions: (...args: unknown[]) => revokeOtherSessions(...args),
    },
  }),
}));

vi.mock("@locations/api/services", async () => {
  const { createServicesMock } = await import("@tests/helpers/api-app");
  return createServicesMock();
});

import { app } from "@locations/api/index";

describe("Better Auth Worker hooks", () => {
  beforeEach(() => {
    resetRateLimits();
    getSession.mockReset();
    revokeOtherSessions.mockReset();
    handler.mockReset();
    handler.mockResolvedValue(new Response("ok", { status: 200 }));
    vi.unstubAllGlobals();
  });

  it("does not require a session for /api/auth/*", async () => {
    getSession.mockResolvedValue(null);
    const res = await requestApp(app, "/api/auth/ok", { method: "GET" });
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalled();
    expect(getSession).not.toHaveBeenCalled();
  });

  it("emails password_changed after a successful change-password", async () => {
    const fetchMock = stubResendFetch();
    getSession.mockResolvedValue(sessionUser({ email: "a@example.com", role: "user" }));
    const env = testEnv({ RESEND_API_KEY: "re_test" });
    const ctx = testExecutionCtx();
    const res = await requestApp(
      app,
      "/api/auth/change-password",
      { method: "POST", body: "{}" },
      env,
      ctx,
    );
    expect(res.status).toBe(200);
    await flushWaitUntil(ctx);
    expect(parseResendCall(fetchMock).body.tags[0].value).toBe("password_changed");
  });

  it("revokes other sessions after a successful change-email", async () => {
    getSession.mockResolvedValue(sessionUser({ email: "a@example.com" }));
    const res = await requestApp(app, "/api/auth/change-email", { method: "POST", body: "{}" });
    expect(res.status).toBe(200);
    expect(revokeOtherSessions).toHaveBeenCalled();
  });

  it("does not send password_changed when change-password fails", async () => {
    const fetchMock = stubResendFetch();
    handler.mockResolvedValue(new Response("nope", { status: 400 }));
    const env = testEnv({ RESEND_API_KEY: "re_test" });
    const ctx = testExecutionCtx();
    const res = await requestApp(
      app,
      "/api/auth/change-password",
      { method: "POST", body: "{}" },
      env,
      ctx,
    );
    expect(res.status).toBe(400);
    expect(ctx.waitUntil).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rate-limits /api/auth/* per IP", async () => {
    const headers = { "cf-connecting-ip": "198.51.100.10" };
    for (let i = 0; i < 30; i++) {
      const res = await requestApp(app, "/api/auth/sign-in/email", { method: "POST", headers });
      expect(res.status).toBe(200);
    }
    const blocked = await requestApp(app, "/api/auth/sign-in/email", { method: "POST", headers });
    expect(blocked.status).toBe(429);
    expect(handler).toHaveBeenCalledTimes(30);
  });
});
