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
import { saveTimelineOverride } from "@locations/api/services";

const env = testEnv();
const put = (body: unknown) =>
  requestApp(
    app,
    "/api/overrides",
    { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    env,
  );

describe("PATCH /api/overrides", () => {
  beforeEach(() => {
    getSession.mockReset();
    vi.mocked(saveTimelineOverride).mockReset();
    vi.mocked(saveTimelineOverride).mockResolvedValue({ kind: "visit", start: "s", note: "n", mode: null } as never);
  });

  it("rejects unauthenticated access", async () => {
    getSession.mockResolvedValue(null);
    expect((await put({ kind: "visit", start: "s", note: "n" })).status).toBe(401);
  });

  it("writes only picked fields, in the session tenant", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    const res = await put({ kind: "visit", start: "s", note: "n", tenant: "user-b", role: "admin" });
    expect(res.status).toBe(200);
    expect(saveTimelineOverride).toHaveBeenCalledWith(expect.anything(), "user-a", {
      kind: "visit",
      start: "s",
      note: "n",
      mode: undefined,
    });
  });

  it("returns 404 for an item the tenant does not have", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    vi.mocked(saveTimelineOverride).mockResolvedValueOnce({ error: "Not found", status: 404 } as never);
    expect((await put({ kind: "visit", start: "other" })).status).toBe(404);
  });

  it("blocks the shared demo", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "demo-1", role: "demo" }));
    expect((await put({ kind: "visit", start: "s", note: "n" })).status).toBe(403);
    expect(saveTimelineOverride).not.toHaveBeenCalled();
  });
});
