import { describe, expect, it } from "vitest";
import { kwhPer100kmToMilesPerKwh } from "\@locations/brim/shared/units.js";
import { catalogueId, mapFuel, normaliseVcaCsv, parseNumber } from "\@locations/brim/shared/vca/normalise.js";

const WLTP_PETROL = `Manufacturer,Model,Description,Transmission,Engine Capacity,Fuel Type,WLTP Imperial Combined,WLTP Metric Combined,CO2 g/km
Ford,Focus,"1.0 EcoBoost 125 Titanium",Manual,999,Petrol,51.4,5.5,114
`;

const NEDC_DIESEL = `Manufacturer,Model,Description,Transmission,Engine Capacity,Fuel Type,Imperial Combined,Metric Combined,CO2 g/km,Testing Scheme
Volkswagen,Golf,"2.0 TDI SE",Manual,1968,Diesel,68.9,4.1,109,NEDC
`;

const BEV_WH = `Manufacturer,Model,Description,Transmission,Fuel Type,wh/km,CO2 g/km
Nissan,Leaf,"110kW Acenta",Automatic,Electricity,171,0
`;

const BEV_MI_KWH = `Manufacturer,Model,Description,Transmission,Fuel Type,Electric energy consumption Miles/kWh,CO2 g/km
Tesla,Model 3,"RWD",Automatic,Electricity,4.4,0
`;

const PHEV = `Manufacturer,Model,Description,Transmission,Engine Capacity,Fuel Type,WLTP Imperial Combined (Weighted),WLTP Imperial Combined,CO2 g/km
BMW,3 Series,"330e M Sport",Automatic,1998,Electricity / Petrol,141.2,40.4,46
`;

const HYBRID = `Manufacturer,Model,Description,Transmission,Engine Capacity,Fuel Type,WLTP Imperial Combined,CO2 g/km
Toyota,Yaris,"1.5 VVT-i Hybrid Icon",CVT,1490,Petrol Electric,68.8,92
`;

const LPG = `Manufacturer,Model,Description,Fuel Type,WLTP Imperial Combined
Vauxhall,Astra,1.4 LPG,LPG,42.0
`;

const QUOTED = `Manufacturer,Model,Description,Fuel Type,WLTP Imperial Combined
Mini,Cooper,"1.5, 3-door",Petrol,47.9
`;

describe("parseNumber", () => {
  it("strips commas and rejects placeholders", () => {
    expect(parseNumber("1,968")).toBe(1968);
    expect(parseNumber("N/A")).toBeUndefined();
    expect(parseNumber("-")).toBeUndefined();
    expect(parseNumber("")).toBeUndefined();
  });
});

describe("mapFuel", () => {
  it("maps VCA fuel strings", () => {
    expect(mapFuel("Petrol", false)).toBe("petrol");
    expect(mapFuel("Diesel", false)).toBe("diesel");
    expect(mapFuel("Electricity", false)).toBe("bev");
    expect(mapFuel("Petrol Electric", false)).toBe("hybrid");
    expect(mapFuel("Electricity / Petrol", false)).toBe("phev");
    expect(mapFuel("Petrol Electric", true)).toBe("phev");
    expect(mapFuel("LPG", false)).toBeUndefined();
  });
});

describe("normaliseVcaCsv", () => {
  it("reads a petrol WLTP row as mpg", () => {
    const { vehicles, skipped } = normaliseVcaCsv(WLTP_PETROL, "test-wltp");
    expect(skipped).toEqual([]);
    expect(vehicles).toHaveLength(1);
    const row = vehicles[0];
    expect(row?.make).toBe("Ford");
    expect(row?.model).toBe("Focus");
    expect(row?.derivative).toBe("1.0 EcoBoost 125 Titanium");
    expect(row?.fuel).toBe("petrol");
    expect(row?.consumptionCombined).toBe(51.4);
    expect(row?.unit).toBe("mpg");
    expect(row?.cycle).toBe("WLTP");
    expect(row?.engineCc).toBe(999);
    expect(row?.co2Gkm).toBe(114);
    expect(row?.id).toBe(
      catalogueId({
        make: "Ford",
        model: "Focus",
        derivative: "1.0 EcoBoost 125 Titanium",
        transmission: "Manual",
        engineCc: 999,
        fuel: "petrol",
        cycle: "WLTP",
      }),
    );
  });

  it("reads an NEDC used-car diesel row", () => {
    const { vehicles } = normaliseVcaCsv(NEDC_DIESEL, "test-nedc");
    expect(vehicles[0]?.fuel).toBe("diesel");
    expect(vehicles[0]?.cycle).toBe("NEDC");
    expect(vehicles[0]?.unit).toBe("mpg");
    expect(vehicles[0]?.consumptionCombined).toBe(68.9);
  });

  it("converts BEV Wh/km to mi/kWh", () => {
    const { vehicles } = normaliseVcaCsv(BEV_WH, "test-bev-wh");
    expect(vehicles[0]?.fuel).toBe("bev");
    expect(vehicles[0]?.unit).toBe("mi/kWh");
    expect(vehicles[0]?.cycle).toBe("WLTP");
    expect(vehicles[0]?.consumptionCombined).toBeCloseTo(kwhPer100kmToMilesPerKwh(17.1), 8);
  });

  it("keeps BEV Miles/kWh", () => {
    const { vehicles } = normaliseVcaCsv(BEV_MI_KWH, "test-bev-mi");
    expect(vehicles[0]?.consumptionCombined).toBe(4.4);
    expect(vehicles[0]?.unit).toBe("mi/kWh");
  });

  it("maps Electricity / Petrol with weighted combined as PHEV mpg", () => {
    const { vehicles } = normaliseVcaCsv(PHEV, "test-phev");
    expect(vehicles[0]?.fuel).toBe("phev");
    expect(vehicles[0]?.consumptionCombined).toBe(141.2);
    expect(vehicles[0]?.unit).toBe("mpg");
    expect(vehicles[0]?.cycle).toBe("WLTP");
  });

  it("maps Petrol Electric as hybrid", () => {
    const { vehicles } = normaliseVcaCsv(HYBRID, "test-hybrid");
    expect(vehicles[0]?.fuel).toBe("hybrid");
    expect(vehicles[0]?.consumptionCombined).toBe(68.8);
  });

  it("skips unknown fuel with a reason", () => {
    const { vehicles, skipped } = normaliseVcaCsv(LPG, "test-lpg");
    expect(vehicles).toEqual([]);
    expect(skipped[0]?.reason).toMatch(/unknown fuel: LPG/);
  });

  it("keeps commas inside quoted derivatives", () => {
    const { vehicles } = normaliseVcaCsv(QUOTED, "test-quoted");
    expect(vehicles[0]?.derivative).toBe("1.5, 3-door");
  });

  it("throws when required columns are missing", () => {
    expect(() => normaliseVcaCsv("Foo,Bar\n1,2\n", "bad")).toThrow(/missing required columns/);
  });
});
