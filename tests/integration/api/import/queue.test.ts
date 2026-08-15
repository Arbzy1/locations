import { beforeEach, describe, expect, it, vi } from "vitest";
import { testEnv } from "@tests/helpers/env";
import { queueMessage } from "@tests/helpers/vendors";
import type { ImportQueueMessage } from "@locations/api/env";

vi.mock("@locations/api/auth", () => ({
  createAuth: () => ({
    handler: async () => new Response("auth"),
    api: { getSession: async () => null },
  }),
}));

vi.mock("@locations/api/services", async () => {
  const { createServicesMock } = await import("@tests/helpers/api-app");
  return createServicesMock();
});

import worker from "@locations/api/index";
import { getImportJob, importSourceData, updateImportJob } from "@locations/api/services";

const message: ImportQueueMessage = {
  jobId: "job-q",
  tenant: "user-a",
  userId: "user-a",
  r2Key: "uploads/user-a/job-q.json",
  sourceId: "src-1",
};

describe("Worker import queue consumer", () => {
  beforeEach(() => {
    vi.mocked(updateImportJob).mockReset();
    vi.mocked(importSourceData).mockReset();
    vi.mocked(getImportJob).mockReset();
    vi.mocked(getImportJob).mockResolvedValue({
      status: "ready",
      notifiedAt: null,
      visitCount: 2,
      activityCount: 1,
    } as never);
  });

  it("marks the job error and deletes R2 when the object is missing", async () => {
    const env = testEnv();
    vi.mocked(env.UPLOADS.get).mockResolvedValue(null);
    const msg = queueMessage(message);
    await worker.queue({ messages: [msg] } as never, env);
    expect(updateImportJob).toHaveBeenCalledWith(
      expect.anything(),
      "job-q",
      expect.objectContaining({ status: "error" }),
      "user-a",
    );
    expect(env.UPLOADS.delete).toHaveBeenCalledWith("uploads/user-a/job-q.json");
    expect(msg.ack).toHaveBeenCalled();
  });

  it("marks the job error and deletes R2 for invalid JSON", async () => {
    const env = testEnv();
    vi.mocked(env.UPLOADS.get).mockResolvedValue({ text: async () => "not-json" } as never);
    const msg = queueMessage(message);
    await worker.queue({ messages: [msg] } as never, env);
    expect(updateImportJob).toHaveBeenCalledWith(
      expect.anything(),
      "job-q",
      expect.objectContaining({ status: "error", error: "Invalid JSON file" }),
      "user-a",
    );
    expect(importSourceData).not.toHaveBeenCalled();
    expect(env.UPLOADS.delete).toHaveBeenCalledWith("uploads/user-a/job-q.json");
    expect(msg.ack).toHaveBeenCalled();
  });

  it("parses, writes counts, and always deletes the R2 object", async () => {
    const env = testEnv();
    vi.mocked(env.UPLOADS.get).mockResolvedValue({
      text: async () => JSON.stringify([{ visit: {} }, { visit: {} }]),
    } as never);
    vi.mocked(importSourceData).mockResolvedValue({ visitCount: 2, activityCount: 1 } as never);
    const msg = queueMessage(message);
    await worker.queue({ messages: [msg] } as never, env);
    expect(importSourceData).toHaveBeenCalled();
    expect(updateImportJob).toHaveBeenCalledWith(
      expect.anything(),
      "job-q",
      expect.objectContaining({
        status: "ready",
        visitCount: 2,
        activityCount: 1,
        parsedCount: 2,
      }),
      "user-a",
    );
    expect(env.UPLOADS.delete).toHaveBeenCalledWith("uploads/user-a/job-q.json");
    expect(msg.ack).toHaveBeenCalled();
  });
});
