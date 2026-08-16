import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestApp } from "@tests/helpers/api-app";
import { testEnv } from "@tests/helpers/env";

const getSession = vi.fn();

vi.mock("@locations/api/auth", () => ({
  createAuth: () => ({
    handler: async () => new Response("auth"),
    api: { getSession: (...args: unknown[]) => getSession(...args) },
  }),
}));

vi.mock("@locations/api/services", async () => {
  const { createServicesMock } = await import("@tests/helpers/api-app");
  return createServicesMock();
});

import { app } from "@locations/api/index";
import { pingDatabase } from "@locations/api/services";

describe("GET /api/health", () => {
  beforeEach(() => {
    getSession.mockReset();
    vi.mocked(pingDatabase).mockReset();
    vi.mocked(pingDatabase).mockResolvedValue(true);
  });

  it("is public and reports db ok", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    getSession.mockResolvedValue(null);
    const env = testEnv({ DATABASE_URL: "postgres://secret-user:secret-pass@host/db" });
    const res = await requestApp(app, "/api/health", undefined, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, worker: "ok", db: "ok", version: expect.any(String) });
    expect(getSession).not.toHaveBeenCalled();
    const logged = [...info.mock.calls, ...error.mock.calls].map((c) => String(c[0])).join(" ");
    expect(logged).not.toContain("secret-pass");
    expect(logged).not.toContain("postgres://");
  });

  it("reports db error when ping fails", async () => {
    vi.mocked(pingDatabase).mockResolvedValue(false);
    const res = await requestApp(app, "/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, worker: "ok", db: "error", version: expect.any(String) });
  });

  it("reports db error when ping throws", async () => {
    vi.mocked(pingDatabase).mockRejectedValue(new Error("neon down"));
    const res = await requestApp(app, "/api/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { db: string; version: string };
    expect(body.db).toBe("error");
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
