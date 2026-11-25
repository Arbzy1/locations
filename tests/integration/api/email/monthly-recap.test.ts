import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testEnv } from "@tests/helpers/env";

const callOrder: string[] = [];
const runMonthlyRecaps = vi.fn(async () => {
  callOrder.push("monthly_recap");
  return { considered: 0, sent: 0 };
});
const runRetention = vi.fn(async () => {
  callOrder.push("retention");
  return { trimmed: 0 };
});
const runHousekeeping = vi.fn(async () => {
  callOrder.push("housekeeping");
  return { expiredExports: 0, failedExports: 0, failedImports: 0 };
});

vi.mock("@locations/api/auth", () => ({
  createAuth: () => ({
    handler: async () => new Response("auth"),
    api: { getSession: async () => null },
  }),
  decodeVerifyTokenPayload: () => null,
}));

vi.mock("@locations/api/services", async () => {
  const { createServicesMock } = await import("@tests/helpers/api-app");
  return createServicesMock();
});

vi.mock("@locations/api/retention", () => ({
  runRetention: (...args: unknown[]) => runRetention(...args),
}));

vi.mock("@locations/api/housekeeping", () => ({
  runHousekeeping: (...args: unknown[]) => runHousekeeping(...args),
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

describe("Worker scheduled jobs", () => {
  beforeEach(() => {
    callOrder.length = 0;
    runMonthlyRecaps.mockClear();
    runRetention.mockClear();
    runHousekeeping.mockClear();
    runBrimSync.mockClear();
    runMonthlyRecaps.mockImplementation(async () => {
      callOrder.push("monthly_recap");
      return { considered: 2, sent: 1 };
    });
    runRetention.mockImplementation(async () => {
      callOrder.push("retention");
      return { trimmed: 0 };
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("runs runMonthlyRecaps before runRetention from a manual scheduled trigger", async () => {
    const env = testEnv();
    await worker.scheduled({} as ScheduledController, env);
    expect(runMonthlyRecaps).toHaveBeenCalledWith(env, expect.any(Date));
    expect(runRetention).toHaveBeenCalledWith(env, expect.any(Date));
    expect(callOrder).toEqual(["monthly_recap", "retention"]);
  });

  it("runs brim_sync, housekeeping, and monthly_recap BEFORE retention on the 08:00 UTC tick of the 1st", async () => {
    const env = testEnv();
    const at = Date.UTC(2026, 10, 1, 8, 0);
    await worker.scheduled({ cron: "*/20 * * * *", scheduledTime: at } as ScheduledController, env);
    expect(runBrimSync).toHaveBeenCalledTimes(1);
    expect(runHousekeeping).toHaveBeenCalledTimes(1);
    expect(runMonthlyRecaps).toHaveBeenCalledWith(env, new Date(at));
    expect(runRetention).toHaveBeenCalledWith(env, new Date(at));
    expect(callOrder.indexOf("monthly_recap")).toBeLessThan(callOrder.indexOf("retention"));
  });

  it("runs daily retention at 08:00 UTC on non-1st days without running monthly_recap", async () => {
    const env = testEnv();
    await worker.scheduled(
      { cron: "*/20 * * * *", scheduledTime: Date.UTC(2026, 10, 2, 8, 0) } as ScheduledController,
      env,
    );
    expect(runBrimSync).toHaveBeenCalledTimes(1);
    expect(runHousekeeping).toHaveBeenCalledTimes(1);
    expect(runRetention).toHaveBeenCalledTimes(1);
    expect(runMonthlyRecaps).not.toHaveBeenCalled();
  });

  it("does not run daily or monthly jobs on non-08:00 20-minute ticks, while running brim_sync and housekeeping", async () => {
    const env = testEnv();
    for (const at of [Date.UTC(2026, 10, 1, 8, 20), Date.UTC(2026, 10, 1, 7, 40)]) {
      await worker.scheduled({ cron: "*/20 * * * *", scheduledTime: at } as ScheduledController, env);
    }
    expect(runBrimSync).toHaveBeenCalledTimes(2);
    expect(runHousekeeping).toHaveBeenCalledTimes(2);
    expect(runRetention).not.toHaveBeenCalled();
    expect(runMonthlyRecaps).not.toHaveBeenCalled();
  });
});
