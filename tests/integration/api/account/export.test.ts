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

import { app } from "@locations/api/index";
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

  it("allows demo to export sample data", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "demo-1", role: "demo" }));
    const res = await request("/api/account/export-pack", { method: "POST" });
    expect(res.status).toBe(200);
    expect(createExportJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenant: "demo" }),
    );
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
});
