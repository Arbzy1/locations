import { describe, expect, it } from "vitest";
import { runBrimSync, syncPlan } from "@locations/api/brim/sync";

describe("syncPlan", () => {
  it("runs carbon with only DATABASE_URL", () => {
    expect(syncPlan({ DATABASE_URL: "postgres://local" })).toEqual({ carbon: true, fuel: false });
  });

  it("runs fuel only when Fuel Finder secrets are present", () => {
    expect(
      syncPlan({
        DATABASE_URL: "postgres://local",
        FUEL_FINDER_CLIENT_ID: "id",
        FUEL_FINDER_CLIENT_SECRET: "secret",
      }),
    ).toEqual({ carbon: true, fuel: true });
  });
});

describe("runBrimSync", () => {
  it("returns without throwing when the database URL is missing", async () => {
    await expect(runBrimSync({}, "2026-08-16T12:00:00Z")).resolves.toBeUndefined();
  });
});
