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

vi.mock("@locations/api/retention", () => ({
  runRetention: vi.fn(async () => ({ trimmed: 0 })),
}));

const runBrimSync = vi.fn(async () => undefined);
vi.mock("@locations/api/brim/sync", () => ({
  BRIM_SYNC_CRON: "*/20 * * * *",
  runBrimSync: (...args: unknown[]) => runBrimSync(...args),
}));

vi.mock("@locations/api/monthly-recap", () => ({
  runMonthlyRecaps: (...args: unknown[]) => runMonthlyRecaps(...args),
}));

import worker from "@locations/api/index";

describe("Worker scheduled monthly recap", () => {
  beforeEach(() => {
    runMonthlyRecaps.mockClear();
    runBrimSync.mockClear();
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

  // One cron per Worker (free plan cap): the 20-minute tick also carries the monthly jobs.
  it("runs the monthly jobs on the 08:00 tick of the 1st, alongside the fuel sync", async () => {
    const env = testEnv();
    await worker.scheduled({ cron: "*/20 * * * *", scheduledTime: Date.UTC(2026, 10, 1, 8, 0) } as ScheduledController, env);
    expect(runBrimSync).toHaveBeenCalledTimes(1);
    expect(runMonthlyRecaps).toHaveBeenCalledWith(env);
  });

  it("does not run the monthly jobs on other 20-minute ticks", async () => {
    const env = testEnv();
    for (const at of [Date.UTC(2026, 10, 1, 8, 20), Date.UTC(2026, 10, 2, 8, 0), Date.UTC(2026, 10, 1, 7, 40)]) {
      await worker.scheduled({ cron: "*/20 * * * *", scheduledTime: at } as ScheduledController, env);
    }
    expect(runBrimSync).toHaveBeenCalledTimes(3);
    expect(runMonthlyRecaps).not.toHaveBeenCalled();
  });
});
