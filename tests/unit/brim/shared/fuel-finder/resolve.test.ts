import { describe, expect, it } from "vitest";
import { FUEL_FINDER_FIXTURES } from "\@locations/brim/shared/fixtures/fuel-finder.js";
import { normaliseFuelFinder } from "\@locations/brim/shared/fuel-finder/normalise.js";
import { observationsFromNormalised, resolveIcePrice } from "\@locations/brim/shared/fuel-finder/resolve.js";

const NOW = FUEL_FINDER_FIXTURES.nowIso;
const CRAWLEY = { lat: 51.1092, lng: -0.1872 };
const EDINBURGH = { lat: 55.9533, lng: -3.1883 };

function corpus() {
  const result = normaliseFuelFinder({
    pfs: FUEL_FINDER_FIXTURES.pfs,
    prices: FUEL_FINDER_FIXTURES.prices,
    nowIso: NOW,
  });
  return observationsFromNormalised(result.stations, result.prices);
}

describe("resolveIcePrice", () => {
  it("prefers a picked station, then origin median, then national, then 140", () => {
    const observations = corpus();
    const picked = resolveIcePrice({
      grade: "E10",
      observations,
      stationId: "ff_shell_crawley",
      origin: CRAWLEY,
    });
    expect(picked.source).toBe("user-picked-station");
    expect(picked.pence).toBe(129.9);
    expect(picked.stationId).toBe("ff_shell_crawley");

    const home = resolveIcePrice({ grade: "E10", observations, origin: CRAWLEY });
    expect(home.source).toBe("home-area-median");
    expect(home.pence).toBe(132.2);

    const national = resolveIcePrice({ grade: "E10", observations, origin: EDINBURGH });
    expect(national.source).toBe("national-median");
    expect(national.pence).toBe(132.2);

    const missing = resolveIcePrice({ grade: "E10", observations: [] });
    expect(missing.source).toBe("hardcoded-fallback");
    expect(missing.pence).toBe(140);
    expect(missing.warning?.code).toBe("price-data-unavailable");
  });

  it("does not use stale or closed sites in the median", () => {
    const observations = corpus();
    const national = resolveIcePrice({ grade: "E10", observations });
    expect(national.pence).toBe(132.2);
  });
});
