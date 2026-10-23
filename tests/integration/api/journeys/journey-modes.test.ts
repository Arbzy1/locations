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
import { applyModeUpdates, modeDetectInputPage, modeDetectionVersion } from "@locations/api/import-session";

const env = testEnv();
const post = (body: unknown) =>
  requestApp(
    app,
    "/api/journeys/modes",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) },
    env,
  );
const get = (path: string) => requestApp(app, path, {}, env);

const detail = { mode: "train", confidence: "high", by: "rail", railPct: 96, medianKmh: 88, v: 1 };
const update = { id: 7, mode: "train", googleMode: "car", modeDetail: detail, railGeometry: [[51.5, -0.2], [51.51, -0.19]] };

beforeEach(() => {
  vi.mocked(applyModeUpdates).mockClear();
  vi.mocked(modeDetectInputPage).mockClear();
});

describe("journey mode detection routes", () => {
  it("require a session", async () => {
    getSession.mockResolvedValue(null);
    expect((await get("/api/journeys/detect-input")).status).toBe(401);
    expect((await post({ updates: [update] })).status).toBe(401);
  });

  it("let the demo read but not write", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "demo-1", role: "demo", emailVerified: true }));
    expect((await get("/api/journeys/detect-input")).status).toBe(200);
    expect((await post({ updates: [update] })).status).toBe(403);
    expect(applyModeUpdates).not.toHaveBeenCalled();
  });

  it("page journeys in the session tenant and report the stored version on the first page", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a", emailVerified: true }));
    vi.mocked(modeDetectionVersion).mockResolvedValueOnce(1);
    expect(await (await get("/api/journeys/detect-input")).json()).toEqual({ rows: [], version: 1, next: null });
    expect(vi.mocked(modeDetectInputPage).mock.calls[0]?.[1]).toBe("user-a");
    expect((await get("/api/journeys/detect-input?after=-1")).status).toBe(400);
  });

  it("apply validated updates to the session tenant only, with a rebuilt detail object", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a", emailVerified: true }));
    vi.mocked(applyModeUpdates).mockResolvedValueOnce(1);
    const res = await post({ updates: [{ ...update, modeDetail: { ...detail, extra: "<script>" } }], doneVersion: 1 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, changed: 1 });
    const [, tenant, chunk] = vi.mocked(applyModeUpdates).mock.calls[0]!;
    expect(tenant).toBe("user-a");
    expect(chunk.updates[0].modeDetail).toEqual(detail);
    expect(chunk.doneVersion).toBe(1);
  });

  it("reject bad modes, ids, details and oversized rail lines", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a", emailVerified: true }));
    expect((await post({ updates: [{ ...update, mode: "teleport" }] })).status).toBe(400);
    expect((await post({ updates: [{ ...update, id: "7" }] })).status).toBe(400);
    expect((await post({ updates: [{ ...update, googleMode: "rocket" }] })).status).toBe(400);
    expect((await post({ updates: [{ ...update, modeDetail: { ...detail, confidence: "sure" } }] })).status).toBe(400);
    const long = Array.from({ length: 301 }, (_, i) => [51.5 + i / 1e4, -0.2]);
    expect((await post({ updates: [{ ...update, railGeometry: long }] })).status).toBe(400);
    expect((await post({ updates: [{ ...update, railGeometry: [[91, 0], [0, 0]] }] })).status).toBe(400);
    expect((await post({ updates: Array.from({ length: 251 }, () => update) })).status).toBe(400);
    expect((await post("{not json")).status).toBe(400);
    expect(applyModeUpdates).not.toHaveBeenCalled();
  });
});
