import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testEnv } from "@tests/helpers/env";

const runMonthlyRecaps = vi.fn(async () => ({ considered: 0, sent: 0 }));

vi.mock("@locations/api/auth", () => ({
  createAuth: () => ({
    handler: async () => new Response("auth"),
    api: { getSession: async () => null },
  }),
}));

vi.mock("@locations/api/services", async () => {
  const { createServicesMock } = await import("@tests/helpers/api-app");
  return createServicesMock();
});

vi.mock("@locations/api/monthly-recap", () => ({
  runMonthlyRecaps: (...args: unknown[]) => runMonthlyRecaps(...args),
}));

import worker from "@locations/api/index";

describe("Worker scheduled monthly recap", () => {
  beforeEach(() => {
    runMonthlyRecaps.mockClear();
    runMonthlyRecaps.mockResolvedValue({ considered: 2, sent: 1 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("runs runMonthlyRecaps from the scheduled Worker entry", async () => {
    const env = testEnv();
    await worker.scheduled({} as ScheduledController, env);
    expect(runMonthlyRecaps).toHaveBeenCalledWith(env);
  });
});
