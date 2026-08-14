import { vi } from "vitest";
import type { Env } from "@locations/api/env";

export function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    DATABASE_URL: "postgres://test",
    BETTER_AUTH_SECRET: "test-secret-at-least-32-chars-long!!",
    BETTER_AUTH_URL: "http://127.0.0.1:8787",
    ASSETS: { fetch: async () => new Response("asset") },
    UPLOADS: {
      put: vi.fn(),
      get: vi.fn(),
    },
    ...overrides,
  } as unknown as Env;
}

export function testExecutionCtx(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
    props: {},
  } as unknown as ExecutionContext;
}
