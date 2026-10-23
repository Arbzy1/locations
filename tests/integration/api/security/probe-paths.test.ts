import { describe, expect, it, vi } from "vitest";

vi.mock("@locations/api/auth", () => ({
  createAuth: () => ({
    handler: async () => new Response("auth"),
    api: { getSession: async () => null },
  }),
}));

vi.mock("@locations/api/services", async () => {
  const { createServicesMock: factory } = await import("@tests/helpers/api-app");
  return factory();
});

import worker from "@locations/api/index";

describe("Worker fetch for non-API paths", () => {
  const assets = vi.fn(async () => new Response("<!doctype html>", { headers: { "Content-Type": "text/html" } }));
  const env = { ASSETS: { fetch: assets }, BETTER_AUTH_URL: "https://example.test" } as never;
  const ctx = { waitUntil: () => undefined, passThroughOnException: () => undefined } as never;

  it("answers exploit probes with a plain 404 instead of the app shell", async () => {
    for (const path of ["/wp-login.php", "/.env", "/.git/config", "/cgi-bin/luci"]) {
      const res = await worker.fetch(new Request(`https://example.test${path}`), env, ctx);
      expect(res.status, path).toBe(404);
      expect(await res.text()).toBe("Not found");
    }
    expect(assets).not.toHaveBeenCalled();
  });

  it("still serves app pages through the static assets", async () => {
    const res = await worker.fetch(new Request("https://example.test/day/2026-01-19"), env, ctx);
    expect(res.status).toBe(200);
    expect(assets).toHaveBeenCalledTimes(1);
  });
});
