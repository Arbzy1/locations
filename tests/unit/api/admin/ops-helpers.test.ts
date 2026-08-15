import { afterEach, describe, expect, it, vi } from "vitest";
import { getOpsMapsProbe, sendOpsEmailTest } from "@locations/api/admin-ops";
import { testEnv } from "@tests/helpers/env";

describe("maps probe redaction", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns name, ok, status, and ms without URLs, tokens, or bodies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("tile-secret-body", { status: 200 })),
    );
    const env = testEnv({
      MAP_TILE_DARK_URL: "https://tiles.example.com/{z}/{x}/{y}.png?key=SECRETTOKEN",
      OSRM_BASE: "https://osrm.example.com",
      GEOCODE_BASE: "https://geocode.example.com",
    });
    const result = await getOpsMapsProbe(env);
    const json = JSON.stringify(result);
    expect(json).not.toContain("SECRETTOKEN");
    expect(json).not.toContain("tiles.example.com");
    expect(json).not.toContain("osrm.example.com");
    expect(json).not.toContain("geocode.example.com");
    expect(json).not.toContain("tile-secret-body");
    expect(json).not.toMatch(/https?:\/\//);
    expect(result.probes.map((p) => p.name).sort()).toEqual(["geocode", "osrm", "tiles"]);
    for (const probe of result.probes) {
      expect(Object.keys(probe).sort()).toEqual(["ms", "name", "ok", "status"]);
      expect(typeof probe.ok).toBe("boolean");
      expect(typeof probe.status).toBe("number");
      expect(typeof probe.ms).toBe("number");
    }
  });
});

describe("email self-test kinds", () => {
  it("rejects kinds that are not password_changed", async () => {
    const result = await sendOpsEmailTest(
      testEnv(),
      { id: "admin-1", email: "staff@example.com", name: "Staff", role: "admin" },
      "monthly_recap",
    );
    expect(result).toEqual({ error: "Kind is not allowed for a self-test", status: 400 });
  });
});
