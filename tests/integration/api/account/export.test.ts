import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestApp, sessionUser } from "@tests/helpers/api-app";
import { testEnv } from "@tests/helpers/env";

const getSession = vi.fn();

vi.mock("@locations/api/auth", () => ({
  createAuth: () => ({
    handler: async () => new Response("auth"),
    api: { getSession: (...args: unknown[]) => getSession(...args) },
  }),
}));

vi.mock("@locations/api/services", async () => {
  const { createServicesMock: factory } = await import("@tests/helpers/api-app");
  return factory();
});

import worker, { app } from "@locations/api/index";
import { resetRateLimits } from "@locations/api/rate-limit";
import {
  createExportJob,
  getActiveExportJob,
  getExportJob,
  updateExportJob,
} from "@locations/api/services";

const env = testEnv();

function request(path: string, init?: RequestInit, requestEnv = env) {
  return requestApp(app, path, init, requestEnv);
}

describe("account export pack", () => {
  beforeEach(() => {
    resetRateLimits();
    getSession.mockReset();
    vi.mocked(createExportJob).mockReset();
    vi.mocked(getActiveExportJob).mockReset();
    vi.mocked(getExportJob).mockReset();
    vi.mocked(updateExportJob).mockReset();
    vi.mocked(getActiveExportJob).mockResolvedValue(null);
    vi.mocked(getExportJob).mockResolvedValue(null);
    vi.mocked(env.UPLOADS.get).mockReset();
    vi.mocked(env.UPLOADS.put).mockReset();
    vi.mocked(env.UPLOADS.delete).mockReset();
  });

  it("rejects unauthenticated pack start", async () => {
    getSession.mockResolvedValue(null);
    const res = await request("/api/account/export-pack", { method: "POST" });
    expect(res.status).toBe(401);
    expect(createExportJob).not.toHaveBeenCalled();
  });

  it("starts a pack for the owner", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    const res = await request("/api/account/export-pack", { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { jobId: string; status: string };
    expect(body.status).toBe("pending");
    expect(body.jobId).toMatch(/[0-9a-f-]{36}/i);
    expect(createExportJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenant: "user-a", userId: "user-a" }),
    );
  });

  it("denies demo export packs", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "demo-1", role: "demo" }));
    const res = await request("/api/account/export-pack", { method: "POST" });
    expect(res.status).toBe(403);
    expect(createExportJob).not.toHaveBeenCalled();
  });

  it("returns 409 when a pack is already running", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    vi.mocked(getActiveExportJob).mockResolvedValue({
      id: "job-open",
      tenant: "user-a",
      userId: "user-a",
      status: "processing",
      error: null,
      visitCount: null,
      activityCount: null,
      r2Key: "exports/user-a/job-open.zip",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    const res = await request("/api/account/export-pack", { method: "POST" });
    expect(res.status).toBe(409);
    expect(createExportJob).not.toHaveBeenCalled();
    const body = (await res.json()) as { job: { id: string } };
    expect(body.job.id).toBe("job-open");
  });

  it("returns 404 for another tenant's job id", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-b" }));
    vi.mocked(getExportJob).mockResolvedValue(null);
    const res = await request("/api/account/export-pack/job-a");
    expect(res.status).toBe(404);
    expect(getExportJob).toHaveBeenCalledWith(expect.anything(), "job-a", "user-b");
  });

  it("returns owner job status without the R2 key", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    vi.mocked(getExportJob).mockResolvedValue({
      id: "job-a",
      tenant: "user-a",
      userId: "user-a",
      status: "ready",
      error: null,
      visitCount: 3,
      activityCount: 1,
      r2Key: "exports/user-a/job-a.zip",
      createdAt: new Date("2026-08-15T00:00:00.000Z"),
      updatedAt: new Date("2026-08-15T00:00:00.000Z"),
    } as never);
    const res = await request("/api/account/export-pack/job-a");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.id).toBe("job-a");
    expect(body.status).toBe("ready");
    expect(body).not.toHaveProperty("r2Key");
  });

  it("downloads the zip then clears the object", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    vi.mocked(getExportJob).mockResolvedValue({
      id: "job-a",
      tenant: "user-a",
      userId: "user-a",
      status: "ready",
      error: null,
      visitCount: 1,
      activityCount: 0,
      r2Key: "exports/user-a/job-a.zip",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    const zipBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    vi.mocked(env.UPLOADS.get).mockResolvedValue({
      arrayBuffer: async () => zipBytes.buffer,
    } as never);
    const res = await request("/api/account/export-pack/job-a/file");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/zip/);
    expect(res.headers.get("Content-Disposition")).toMatch(/locations-gdpr-pack-.*\.zip/);
    expect(env.UPLOADS.delete).toHaveBeenCalledWith("exports/user-a/job-a.zip");
    expect(updateExportJob).toHaveBeenCalledWith(
      expect.anything(),
      "job-a",
      "user-a",
      expect.objectContaining({ r2Key: null }),
    );
  });

  it("rejects unauthenticated file download", async () => {
    getSession.mockResolvedValue(null);
    const res = await request("/api/account/export-pack/job-a/file");
    expect(res.status).toBe(401);
  });

  it("enqueues onto IMPORT_QUEUE when bound and consumes export_pack messages in worker.queue", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    const send = vi.fn(async () => undefined);
    const queuedEnv = testEnv({ IMPORT_QUEUE: { send } as unknown as Queue });
    const res = await request("/api/account/export-pack", { method: "POST" }, queuedEnv);
    expect(res.status).toBe(200);
    const { jobId } = (await res.json()) as { jobId: string };
    expect(send).toHaveBeenCalledWith({
      kind: "export_pack",
      jobId,
      tenant: "user-a",
      userId: "user-a",
      r2Key: `exports/user-a/${jobId}.zip`,
    });

    vi.mocked(getExportJob).mockResolvedValue({
      id: jobId,
      tenant: "user-a",
      userId: "user-a",
      status: "processing",
      r2Key: `exports/user-a/${jobId}.zip`,
    } as never);
    const ack = vi.fn();
    const retry = vi.fn();
    await worker.queue(
      {
        messages: [
          {
            body: {
              kind: "export_pack",
              jobId,
              tenant: "user-a",
              userId: "user-a",
              r2Key: `exports/user-a/${jobId}.zip`,
            },
            ack,
            retry,
          },
        ],
      } as unknown as MessageBatch<unknown>,
      queuedEnv,
    );
    expect(ack).toHaveBeenCalledTimes(1);
    expect(retry).not.toHaveBeenCalled();
    expect(queuedEnv.UPLOADS.put).toHaveBeenCalled();
  });
});
