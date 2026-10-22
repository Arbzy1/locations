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
import { deletePlaceData, upsertUserSettings } from "@locations/api/services";

const env = testEnv();
const request = (path: string, init: RequestInit = {}) => requestApp(app, path, init, env);

describe("DELETE /api/places/:key/data", () => {
  beforeEach(() => {
    getSession.mockReset();
    vi.mocked(deletePlaceData).mockReset();
    vi.mocked(deletePlaceData).mockResolvedValue({ visitCount: 3, activityCount: 2, trimmedPaths: 1 } as never);
  });

  it("rejects unauthenticated access", async () => {
    getSession.mockResolvedValue(null);
    expect((await request("/api/places/g%3Ahome/data", { method: "DELETE" })).status).toBe(401);
    expect(deletePlaceData).not.toHaveBeenCalled();
  });

  it("deletes in the session tenant only", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    const res = await request("/api/places/g%3Ahome/data?tenant=user-b", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(deletePlaceData).toHaveBeenCalledWith(expect.anything(), "user-a", "g:home");
  });

  it("returns 404 for a place the tenant does not have", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    vi.mocked(deletePlaceData).mockResolvedValueOnce({ error: "Place not found", status: 404 } as never);
    expect((await request("/api/places/g%3Aother/data", { method: "DELETE" })).status).toBe(404);
  });

  it("blocks the shared demo", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "demo-1", role: "demo" }));
    expect((await request("/api/places/g%3Ahome/data", { method: "DELETE" })).status).toBe(403);
    expect(deletePlaceData).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/account/settings retentionYears", () => {
  beforeEach(() => {
    getSession.mockReset();
    vi.mocked(upsertUserSettings).mockReset();
    vi.mocked(upsertUserSettings).mockResolvedValue({ retentionYears: 3 } as never);
  });

  const patch = (body: unknown) =>
    request("/api/account/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  it("accepts the offered choices and forever", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    expect((await patch({ retentionYears: null })).status).toBe(200);
    expect(vi.mocked(upsertUserSettings).mock.calls[0]?.[2]).toMatchObject({ retentionYears: null });
  });

  it("rejects other values", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    expect((await patch({ retentionYears: 0 })).status).toBe(400);
    expect((await patch({ retentionYears: 4 })).status).toBe(400);
    expect(upsertUserSettings).not.toHaveBeenCalled();
  });
});
