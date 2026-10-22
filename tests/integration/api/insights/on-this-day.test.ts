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
import { getOnThisDay } from "@locations/api/services";

const env = testEnv();
const request = (path: string) => requestApp(app, path, {}, env);

describe("GET /api/on-this-day", () => {
  beforeEach(() => {
    getSession.mockReset();
    vi.mocked(getOnThisDay).mockClear();
  });

  it("rejects unauthenticated access", async () => {
    getSession.mockResolvedValue(null);
    expect((await request("/api/on-this-day?date=2024-06-01")).status).toBe(401);
    expect(getOnThisDay).not.toHaveBeenCalled();
  });

  it("reads the session tenant for the client's date", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    const res = await request("/api/on-this-day?date=2024-06-01&tenant=user-b");
    expect(res.status).toBe(200);
    expect(getOnThisDay).toHaveBeenCalledWith(expect.anything(), "user-a", { date: "2024-06-01" });
  });

  it("lets the demo read its own sample", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "demo-1", role: "demo" }));
    expect((await request("/api/on-this-day?date=2024-06-01")).status).toBe(200);
    expect(vi.mocked(getOnThisDay).mock.calls[0]?.[1]).toBe("demo");
  });

  it("returns 400 for a bad date", async () => {
    getSession.mockResolvedValue(sessionUser({ id: "user-a" }));
    vi.mocked(getOnThisDay).mockResolvedValueOnce({ error: "date must be YYYY-MM-DD" } as never);
    expect((await request("/api/on-this-day?date=nope")).status).toBe(400);
  });
});
