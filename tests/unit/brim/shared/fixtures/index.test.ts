import { describe, expect, it } from "vitest";
import { loadFixture } from "\@locations/brim/shared/fixtures/index.js";

describe("loadFixture", () => {
  it("throws when BRIM_FIXTURES is not set", () => {
    expect(() => loadFixture("health", "0")).toThrow(/BRIM_FIXTURES=1/);
  });

  it("returns the health fixture when enabled", () => {
    const health = loadFixture<{ fixtureMode: boolean }>("health", "1");
    expect(health.fixtureMode).toBe(true);
  });

  it("returns the VCA catalogue subset when enabled", () => {
    const cars = loadFixture<Array<{ make: string; fuel: string }>>("vca-vehicles", "1");
    expect(cars.length).toBeGreaterThanOrEqual(20);
    expect(new Set(cars.map((c) => c.fuel)).size).toBeGreaterThanOrEqual(4);
  });

  it("returns carbon intensity half-hours when enabled", () => {
    const rows = loadFixture<Array<{ region: string; intensityGPerKwh: number }>>(
      "carbon-intensity",
      "1",
    );
    expect(rows.some((r) => r.region === "GB" && r.intensityGPerKwh === 190)).toBe(true);
  });

  it("returns dummy DVLA VES bodies when enabled", () => {
    const dvla = loadFixture<{ ves: Record<string, { make: string; euroStatus: string }> }>("dvla", "1");
    expect(dvla.ves.AB12CDE?.make).toBe("VOLKSWAGEN");
    expect(dvla.ves.ZZ99ZZZ?.euroStatus).toBe("EURO 5");
    expect(JSON.stringify(dvla)).not.toMatch(/registrationNumber/i);
  });

  it("returns the dummy Maps short-link table when enabled", () => {
    const table = loadFixture<{ redirects: Record<string, string> }>("maps-short", "1");
    expect(table.redirects["https://maps.app.goo.gl/brimtest"]).toBe(
      "https://www.google.com/maps/dir/Crawley/London/",
    );
  });
});
