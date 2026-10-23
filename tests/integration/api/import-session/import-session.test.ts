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

vi.mock("@locations/api/import-session", async () => {
  const { createImportSessionMock } = await import("@tests/helpers/import-session-mock");
  return createImportSessionMock();
});

import { app } from "@locations/api/index";
import {
  appendImportRows,
  existingImportDays,
  finishImportJob,
  openImportJob,
  startImportJob,
  writeAggregates,
} from "@locations/api/import-session";

const env = testEnv();
const post = (path: string, body: unknown) =>
  requestApp(
    app,
    path,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    },
    env,
  );
const get = (path: string) => requestApp(app, path, {}, env);

const job = { id: "job-1", sourceId: "src-1", status: "processing", visitCount: 0, activityCount: 0 };
const stay = {
  start: "2024-06-01T08:00:00Z",
  end: "2024-06-01T09:00:00Z",
  date: "2024-06-01",
  lat: 51.5,
  lon: -0.1,
  cluster: "c",
  semanticType: "Unknown",
  placeId: null,
  durationMinutes: 60,
};
const start = { visitCount: 1, activityCount: 0, parsedCount: 1 };

beforeEach(() => {
  getSession.mockReset();
  vi.mocked(startImportJob).mockReset();
  vi.mocked(openImportJob).mockReset().mockResolvedValue(null);
  vi.mocked(appendImportRows).mockClear();
  vi.mocked(finishImportJob).mockClear();
  vi.mocked(writeAggregates).mockClear();
  vi.mocked(existingImportDays).mockReset().mockResolvedValue(null);
});

describe("browser import routes", () => {
  it("require a session", async () => {
    getSession.mockResolvedValue(null);
    expect((await post("/api/import/start", start)).status).toBe(401);
    expect((await post("/api/import/job-1/rows", { visits: [stay] })).status).toBe(401);
    expect((await get("/api/aggregates/status")).status).toBe(401);
  });

  it("block the shared demo from writing", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "demo-1", role: "demo", emailVerified: true }));
    expect((await post("/api/import/start", start)).status).toBe(403);
    expect((await post("/api/import/job-1/rows", { visits: [stay] })).status).toBe(403);
    expect((await post("/api/aggregates", { done: true })).status).toBe(403);
    expect(startImportJob).not.toHaveBeenCalled();
  });

  it("require a verified email to start", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a", emailVerified: false }));
    expect((await post("/api/import/start", start)).status).toBe(403);
  });

  it("start in the session tenant with picked fields only", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a", emailVerified: true }));
    vi.mocked(startImportJob).mockResolvedValue({
      status: 200,
      jobId: "job-1",
      sourceId: "src-1",
      label: "Google account 1",
    });
    const res = await post("/api/import/start", {
      visitCount: 10,
      activityCount: 5,
      parsedCount: 20,
      label: "Phone",
      tenant: "user-b",
      userId: "user-b",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ jobId: "job-1", batchRows: 250 });
    expect(vi.mocked(startImportJob).mock.calls[0]?.[1]).toBe("user-a");
    expect(vi.mocked(startImportJob).mock.calls[0]?.[2]).toMatchObject({ userId: "user-a", label: "Phone", merge: false });
  });

  it("reject empty or impossible counts and a second import", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a", emailVerified: true }));
    expect((await post("/api/import/start", { visitCount: 0, activityCount: 0, parsedCount: 0 })).status).toBe(400);
    expect((await post("/api/import/start", { visitCount: -1, activityCount: 0, parsedCount: 1 })).status).toBe(400);
    vi.mocked(startImportJob).mockResolvedValue({ status: 409 });
    expect((await post("/api/import/start", start)).status).toBe(409);
  });

  it("only accept rows for this tenant's open job", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a", emailVerified: true }));
    expect((await post("/api/import/other/rows", { visits: [stay] })).status).toBe(404);
    expect(appendImportRows).not.toHaveBeenCalled();
    vi.mocked(openImportJob).mockResolvedValue(job as never);
    const ok = await post("/api/import/job-1/rows", { visits: [stay] });
    expect(ok.status).toBe(200);
    expect(vi.mocked(openImportJob).mock.calls.at(-1)?.[1]).toBe("user-a");
    expect(appendImportRows).toHaveBeenCalledTimes(1);
  });

  it("reject invalid and oversized batches", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a", emailVerified: true }));
    vi.mocked(openImportJob).mockResolvedValue(job as never);
    expect((await post("/api/import/job-1/rows", { visits: [{ ...stay, lat: 500 }] })).status).toBe(400);
    expect((await post("/api/import/job-1/rows", "{not json")).status).toBe(400);
    const huge = JSON.stringify({ visits: [{ ...stay, cluster: "x".repeat(300 * 1024) }] });
    expect((await post("/api/import/job-1/rows", huge)).status).toBe(413);
    expect(appendImportRows).not.toHaveBeenCalled();
  });

  it("finish marks the job ready and passes the trips", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a", emailVerified: true }));
    expect((await post("/api/import/job-1/finish", {})).status).toBe(404);
    vi.mocked(openImportJob).mockResolvedValue(job as never);
    const res = await post("/api/import/job-1/finish", {
      memories: [{ start: "2022-04-13T06:56:34Z", end: "2022-04-15T18:06:38Z", distanceKm: 202 }],
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ready", aggregatesStale: true });
    expect(vi.mocked(finishImportJob).mock.calls[0]?.[3]).toHaveLength(1);
  });

  it("existing days are 404 for another tenant's source", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a", emailVerified: true }));
    expect((await get("/api/import/existing?sourceId=theirs")).status).toBe(404);
    vi.mocked(existingImportDays).mockResolvedValue({ visitCount: 3, dates: ["2024-06-01"] });
    expect(await (await get("/api/import/existing?sourceId=mine")).json()).toEqual({
      visitCount: 3,
      dates: ["2024-06-01"],
    });
  });
});

describe("aggregate routes", () => {
  it("store validated chunks in the session tenant", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a", emailVerified: true }));
    const res = await post("/api/aggregates", {
      reset: true,
      done: true,
      dayStats: [{ date: "2024-06-01", totalDistanceMiles: 1, modes: {}, clusters: [], visitCount: 1, activityCount: 0 }],
      analytics: { monthly: [] },
    });
    expect(res.status).toBe(200);
    expect(vi.mocked(writeAggregates).mock.calls[0]?.[1]).toBe("user-a");
    expect((await post("/api/aggregates", { analytics: { "bad key": 1 } })).status).toBe(400);
  });

  it("page input rows and validate the table", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a", emailVerified: true }));
    expect((await get("/api/aggregates/input?table=users")).status).toBe(400);
    expect(await (await get("/api/aggregates/input?table=visits")).json()).toEqual({ rows: [], next: null });
  });
});
