import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestApp, sessionUser } from "@tests/helpers/api-app";
import { testEnv, testExecutionCtx } from "@tests/helpers/env";
import { flushWaitUntil, mockImportQueue } from "@tests/helpers/vendors";
import { resetRateLimits } from "@locations/api/rate-limit";
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

import { app } from "@locations/api/index";
import {
  createImportJob,
  ensureDataSource,
  getActiveImportJob,
  getSourceById,
  getSubscription,
  listSources,
} from "@locations/api/services";

function timelineFile() {
  const body = JSON.stringify([
    {
      startTime: "2024-06-01T10:00:00Z",
      endTime: "2024-06-01T11:00:00Z",
      visit: { topCandidate: { placeLocation: "geo:40.7,-74.0", semanticType: "Home" } },
    },
  ]);
  return new File([body], "timeline.json", { type: "application/json" });
}

function formWithFile(extra?: Record<string, string>) {
  const form = new FormData();
  form.append("file", timelineFile());
  for (const [key, value] of Object.entries(extra ?? {})) form.append(key, value);
  return form;
}

describe("POST /api/import", () => {
  beforeEach(() => {
    resetRateLimits();
    getSession.mockReset();
    vi.mocked(getActiveImportJob).mockReset();
    vi.mocked(getActiveImportJob).mockResolvedValue(null);
    vi.mocked(getSubscription).mockReset();
    vi.mocked(getSubscription).mockResolvedValue(null);
    vi.mocked(listSources).mockReset();
    vi.mocked(listSources).mockResolvedValue([]);
    vi.mocked(ensureDataSource).mockReset();
    vi.mocked(ensureDataSource).mockResolvedValue({
      id: "src-new",
      label: "Google account 1",
    } as never);
    vi.mocked(createImportJob).mockReset();
    vi.mocked(getSourceById).mockReset();
    vi.mocked(getSourceById).mockResolvedValue(null);
  });

  it("rejects unauthenticated access", async () => {
    getSession.mockResolvedValue(null);
    const res = await requestApp(app, "/api/import", { method: "POST", body: formWithFile() });
    expect(res.status).toBe(401);
    expect(createImportJob).not.toHaveBeenCalled();
  });

  it("blocks demo users", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "demo-1", role: "demo", emailVerified: true }));
    const env = testEnv();
    const res = await requestApp(app, "/api/import", { method: "POST", body: formWithFile() }, env);
    expect(res.status).toBe(403);
    expect(env.UPLOADS.put).not.toHaveBeenCalled();
  });

  it("requires a verified email", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a", emailVerified: false }));
    const res = await requestApp(app, "/api/import", { method: "POST", body: formWithFile() });
    expect(res.status).toBe(403);
    expect(createImportJob).not.toHaveBeenCalled();
  });

  it("returns 402 when Stripe is configured and the user is not entitled", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a", emailVerified: true }));
    const env = testEnv({ STRIPE_SECRET_KEY: "sk_test" });
    const res = await requestApp(app, "/api/import", { method: "POST", body: formWithFile() }, env);
    expect(res.status).toBe(402);
    expect(env.UPLOADS.put).not.toHaveBeenCalled();
  });

  it("lets staff skip the Stripe import gate", async () => {
    getSession.mockResolvedValue(
      sessionUser({ id: "admin-1", role: "admin", emailVerified: true }),
    );
    const env = testEnv({ STRIPE_SECRET_KEY: "sk_test" });
    const res = await requestApp(app, "/api/import", { method: "POST", body: formWithFile() }, env);
    expect(res.status).toBe(200);
    expect(env.UPLOADS.put).toHaveBeenCalled();
  });

  it("stores a server-generated R2 key and enqueues when IMPORT_QUEUE is bound", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a", emailVerified: true }));
    const queue = mockImportQueue();
    const env = testEnv({ IMPORT_QUEUE: queue as Env["IMPORT_QUEUE"] });
    const ctx = testExecutionCtx();
    const res = await requestApp(app, "/api/import", { method: "POST", body: formWithFile() }, env, ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { jobId: string; sourceId: string };
    expect(body.sourceId).toBe("src-new");
    expect(body.jobId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    const r2Key = `uploads/user-a/${body.jobId}.json`;
    expect(env.UPLOADS.put).toHaveBeenCalledWith(
      r2Key,
      expect.any(String),
      expect.objectContaining({ httpMetadata: { contentType: "application/json" } }),
    );
    expect(createImportJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: body.jobId, tenant: "user-a", r2Key, status: "pending" }),
    );
    expect(queue.send).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: body.jobId, tenant: "user-a", r2Key, userId: "user-a" }),
    );
    expect(ctx.waitUntil).not.toHaveBeenCalled();
  });

  it("runs the import inline when IMPORT_QUEUE is unbound", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a", emailVerified: true }));
    const env = testEnv();
    vi.mocked(env.UPLOADS.get).mockResolvedValue({ text: async () => "[]" } as never);
    const ctx = testExecutionCtx();
    const res = await requestApp(app, "/api/import", { method: "POST", body: formWithFile() }, env, ctx);
    expect(res.status).toBe(200);
    expect(ctx.waitUntil).toHaveBeenCalled();
    await flushWaitUntil(ctx);
    expect(env.UPLOADS.delete).toHaveBeenCalled();
  });

  it("returns 404 for a foreign sourceId and does not put to R2", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a", emailVerified: true }));
    const env = testEnv();
    const res = await requestApp(
      app,
      "/api/import",
      { method: "POST", body: formWithFile({ sourceId: "src-other" }) },
      env,
    );
    expect(res.status).toBe(404);
    expect(env.UPLOADS.put).not.toHaveBeenCalled();
    expect(createImportJob).not.toHaveBeenCalled();
  });
});
