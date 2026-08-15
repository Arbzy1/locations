import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestApp, sessionUser } from "@tests/helpers/api-app";
import { testEnv } from "@tests/helpers/env";

const getSession = vi.fn();

vi.mock("@locations/api/auth", () => ({
  createAuth: () => ({
    handler: async () => new Response("auth"),
    api: {
      getSession: (...args: unknown[]) => getSession(...args),
    },
  }),
}));

vi.mock("@locations/api/services", async () => {
  const { createServicesMock: factory } = await import("@tests/helpers/api-app");
  return factory();
});

import { app } from "@locations/api/index";
import { previewImport, getSourceById } from "@locations/api/services";

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

describe("POST /api/import/preview", () => {
  beforeEach(() => {
    getSession.mockReset();
    vi.mocked(previewImport).mockReset();
    vi.mocked(getSourceById).mockReset();
    vi.mocked(previewImport).mockResolvedValue({
      chosenPath: "timeline.json",
      candidates: ["timeline.json"],
      format: "classic",
      visitCount: 1,
      activityCount: 0,
      dateMin: "2024-06-01",
      dateMax: "2024-06-01",
      overlappingDays: 0,
      newDays: 1,
      existingDays: 0,
      overlappingSample: [],
      replaceWouldRemoveVisits: 0,
      mergeWouldAppendVisits: 1,
      skipOverlapWouldAppendVisits: 1,
      timezoneWarning: { warn: false, skewedShare: 0, sampleCount: 1 },
    } as never);
    vi.mocked(getSourceById).mockResolvedValue(null);
  });

  it("rejects unauthenticated access", async () => {
    getSession.mockResolvedValue(null);
    const res = await request("/api/import/preview", { method: "POST" });
    expect(res.status).toBe(401);
    expect(previewImport).not.toHaveBeenCalled();
  });

  it("blocks demo users", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "demo-1", role: "demo", emailVerified: true }));
    const form = new FormData();
    form.append("file", timelineFile());
    const res = await request("/api/import/preview", { method: "POST", body: form });
    expect(res.status).toBe(403);
    expect(previewImport).not.toHaveBeenCalled();
  });

  it("returns owner preview counts without writing storage", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a", emailVerified: true }));
    const form = new FormData();
    form.append("file", timelineFile());
    const res = await request("/api/import/preview", { method: "POST", body: form });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { visitCount: number; chosenPath: string };
    expect(body.visitCount).toBe(1);
    expect(body.chosenPath).toBe("timeline.json");
    expect(previewImport).toHaveBeenCalled();
    expect(env.UPLOADS.put).not.toHaveBeenCalled();
  });

  it("returns 404 for a foreign source id", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a", emailVerified: true }));
    vi.mocked(getSourceById).mockResolvedValue(null);
    const form = new FormData();
    form.append("file", timelineFile());
    form.append("sourceId", "src-other");
    const res = await request("/api/import/preview", { method: "POST", body: form });
    expect(res.status).toBe(404);
    expect(previewImport).not.toHaveBeenCalled();
  });
});
