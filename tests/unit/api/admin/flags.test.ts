import { describe, expect, it } from "vitest";
import { flagsFromEnv, mergeFlags } from "@locations/api/ops-flags";
import { testEnv } from "@tests/helpers/env";

describe("ops flag overlay", () => {
  it("uses wrangler env when no DB rows exist", () => {
    const env = flagsFromEnv(testEnv({ DISABLE_SIGNUP: "true", GLOBE_ENABLED: "false" }));
    expect(mergeFlags(env, [])).toEqual({
      signupDisabled: true,
      landingEnabled: true,
      globeEnabled: false,
      demoTour: true,
    });
  });

  it("lets a DB row override the env default", () => {
    const env = flagsFromEnv(testEnv({ DISABLE_SIGNUP: "false", LANDING_ENABLED: "true" }));
    const merged = mergeFlags(env, [
      { key: "signup_disabled", value: "true" },
      { key: "landing_enabled", value: "false" },
    ]);
    expect(merged.signupDisabled).toBe(true);
    expect(merged.landingEnabled).toBe(false);
    expect(merged.globeEnabled).toBe(true);
  });
});
