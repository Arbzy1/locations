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
import { createImportJob, getActiveImportJob } from "@locations/api/services";

const env = testEnv();

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

async function request(path: string, init?: RequestInit) {
  return requestApp(app, path, init, env);
}

describe("POST /api/import concurrent jobs", () => {
  beforeEach(() => {
    getSession.mockReset();
    vi.mocked(createImportJob).mockReset();
    vi.mocked(getActiveImportJob).mockReset();
    vi.mocked(getActiveImportJob).mockResolvedValue(null);
  });

  it("returns 409 when an import is already running", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a", emailVerified: true }));
    vi.mocked(getActiveImportJob).mockResolvedValue({ id: "job-open", status: "processing" } as never);
    const form = new FormData();
    form.append("file", timelineFile());
    const res = await request("/api/import", { method: "POST", body: form });
    expect(res.status).toBe(409);
    expect(createImportJob).not.toHaveBeenCalled();
    const body = (await res.json()) as { jobId: string };
    expect(body.jobId).toBe("job-open");
  });

  it("blocks demo users", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "demo-1", role: "demo", emailVerified: true }));
    const form = new FormData();
    form.append("file", timelineFile());
    const res = await request("/api/import", { method: "POST", body: form });
    expect(res.status).toBe(403);
    expect(getActiveImportJob).not.toHaveBeenCalled();
  });
});
