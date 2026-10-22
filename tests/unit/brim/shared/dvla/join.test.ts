import { describe, expect, it } from "vitest";
import { VCA_VEHICLE_FIXTURES } from "\@locations/brim/shared/fixtures/vca-vehicles.js";
import {
  DVLA_FIXTURE_BEV,
  DVLA_FIXTURE_FEW,
  DVLA_FIXTURE_NONE,
  DVLA_FIXTURE_SINGLE,
  DVLA_VES_FIXTURES,
} from "\@locations/brim/shared/fixtures/dvla.js";
import { joinOutcome, joinVca } from "\@locations/brim/shared/dvla/join.js";
import { mapDvlaFuel, normaliseVrm } from "\@locations/brim/shared/dvla/normalise.js";
import { parseVesJson } from "\@locations/brim/shared/dvla/pull.js";
import type { VcaVehicle } from "\@locations/brim/shared/vca/types.js";

function vesFromFixture(plate: string) {
  const row = DVLA_VES_FIXTURES[plate];
  expect(row).toBeTruthy();
  const parsed = parseVesJson(row);
  if ("reason" in parsed) throw new Error(parsed.reason);
  return parsed;
}

describe("normaliseVrm", () => {
  it("accepts the current UK format and rejects the rest", () => {
    expect(normaliseVrm("ab12 cde")).toBe("AB12CDE");
    expect(normaliseVrm("AB12CDE")).toBe("AB12CDE");
    expect(normaliseVrm("NOPE")).toBeUndefined();
    expect(normaliseVrm("A1BCD")).toBeUndefined();
  });
});

describe("mapDvlaFuel", () => {
  it("does not treat hybrid electric as a BEV", () => {
    expect(mapDvlaFuel("PETROL")).toBe("petrol");
    expect(mapDvlaFuel("DIESEL")).toBe("diesel");
    expect(mapDvlaFuel("ELECTRICITY")).toBe("bev");
    expect(mapDvlaFuel("HYBRID ELECTRIC")).toBe("hybrid");
    expect(mapDvlaFuel("PETROL/ELECTRIC")).toBe("phev");
    expect(mapDvlaFuel("DIESEL/ELECTRIC")).toBe("phev");
    expect(mapDvlaFuel("STEAM")).toBeUndefined();
  });
});

describe("joinVca", () => {
  it("returns a unique Golf for the single fixture", () => {
    const hits = joinVca(vesFromFixture(DVLA_FIXTURE_SINGLE), VCA_VEHICLE_FIXTURES);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.id).toBe("vca_vw_golf_15_tsi");
    expect(joinOutcome(hits.length)).toBe("single");
  });

  it("lists Fiesta and Focus for the close Ford petrol", () => {
    const hits = joinVca(vesFromFixture(DVLA_FIXTURE_FEW), VCA_VEHICLE_FIXTURES);
    expect(hits.map((h) => h.id).sort()).toEqual([
      "vca_ford_fiesta_10_stline",
      "vca_ford_focus_10_titanium",
    ]);
    expect(joinOutcome(hits.length)).toBe("few");
  });

  it("returns none when nothing is in tolerance, and still parsed euro from VES", () => {
    const ves = vesFromFixture(DVLA_FIXTURE_NONE);
    expect(ves.euroStatus).toBe("EURO 5");
    expect(joinVca(ves, VCA_VEHICLE_FIXTURES)).toEqual([]);
    expect(joinOutcome(0)).toBe("none");
  });

  it("matches a BEV without engine capacity", () => {
    const hits = joinVca(vesFromFixture(DVLA_FIXTURE_BEV), VCA_VEHICLE_FIXTURES);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.id).toBe("vca_nissan_leaf");
  });

  it("treats more than six hits as none", () => {
    const clones: VcaVehicle[] = Array.from({ length: 7 }, (_, i) => ({
      id: `vca_flood_${i}`,
      make: "Flood",
      model: `Car ${i}`,
      fuel: "petrol",
      engineCc: 1000,
      co2Gkm: 120,
      consumptionCombined: 50,
      unit: "mpg",
      cycle: "WLTP",
      datasetVersion: "fixture",
    }));
    const hits = joinVca(
      { make: "Flood", propulsion: "petrol", engineCc: 1000, co2Gkm: 120 },
      clones,
    );
    expect(hits).toEqual([]);
    expect(joinOutcome(hits.length)).toBe("none");
  });
});

describe("join corpus match-count buckets", () => {
  it("covers 50 dummy cases: 40 single, 5 few, 5 none", () => {
    const vehicles: VcaVehicle[] = [];
    const cases: Array<{ ves: { make: string; propulsion: "petrol"; engineCc: number; co2Gkm: number }; bucket: "single" | "few" | "none" }> = [];

    for (let i = 0; i < 40; i++) {
      const make = `JoinMake${String(i).padStart(2, "0")}`;
      vehicles.push({
        id: `vca_join_${i}`,
        make,
        model: "Car",
        fuel: "petrol",
        engineCc: 1000,
        co2Gkm: 120,
        consumptionCombined: 50,
        unit: "mpg",
        cycle: "WLTP",
        datasetVersion: "fixture",
      });
      cases.push({
        ves: { make, propulsion: "petrol", engineCc: 1000, co2Gkm: 120 },
        bucket: "single",
      });
    }

    for (let i = 0; i < 5; i++) {
      const make = `JoinFew${i}`;
      vehicles.push(
        {
          id: `vca_few_${i}_a`,
          make,
          model: "A",
          fuel: "petrol",
          engineCc: 1000,
          co2Gkm: 118,
          consumptionCombined: 50,
          unit: "mpg",
          cycle: "WLTP",
          datasetVersion: "fixture",
        },
        {
          id: `vca_few_${i}_b`,
          make,
          model: "B",
          fuel: "petrol",
          engineCc: 1020,
          co2Gkm: 122,
          consumptionCombined: 48,
          unit: "mpg",
          cycle: "WLTP",
          datasetVersion: "fixture",
        },
      );
      cases.push({
        ves: { make, propulsion: "petrol", engineCc: 1010, co2Gkm: 120 },
        bucket: "few",
      });
    }

    for (let i = 0; i < 5; i++) {
      cases.push({
        ves: { make: `JoinNone${i}`, propulsion: "petrol", engineCc: 1000, co2Gkm: 120 },
        bucket: "none",
      });
    }

    expect(cases).toHaveLength(50);
    const counts = { single: 0, few: 0, none: 0 };
    for (const row of cases) {
      const hits = joinVca(row.ves, vehicles);
      const bucket = joinOutcome(hits.length);
      expect(bucket).toBe(row.bucket);
      counts[bucket] += 1;
    }
    expect(counts).toEqual({ single: 40, few: 5, none: 5 });
  });
});

describe("parseVesJson", () => {
  it("never copies the registration number onto the vehicle", () => {
    const parsed = parseVesJson({
      registrationNumber: "AB12CDE",
      make: "FORD",
      fuelType: "PETROL",
      yearOfManufacture: 2020,
      engineCapacity: 999,
      co2Emissions: 115,
      euroStatus: "EURO 6",
    });
    expect(parsed).not.toHaveProperty("registrationNumber");
    expect(JSON.stringify(parsed)).not.toMatch(/AB12CDE/);
  });
});
