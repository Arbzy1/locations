/** Dummy plates only. Recorded-looking VES bodies, no real people's regs. */
export const DVLA_FIXTURE_SINGLE = "AB12CDE";
export const DVLA_FIXTURE_FEW = "XY98ZAB";
export const DVLA_FIXTURE_NONE = "ZZ99ZZZ";
export const DVLA_FIXTURE_BEV = "LN19AAA";
export const DVLA_FIXTURE_NOT_FOUND = "AA00AAA";

type FixtureRow = {
  make: string;
  fuelType: string;
  yearOfManufacture: number;
  engineCapacity?: number;
  co2Emissions: number;
  euroStatus: string;
};

export const DVLA_VES_FIXTURES: Record<string, FixtureRow> = {
  [DVLA_FIXTURE_SINGLE]: {
    make: "VOLKSWAGEN",
    fuelType: "PETROL",
    yearOfManufacture: 2021,
    engineCapacity: 1498,
    co2Emissions: 122,
    euroStatus: "EURO 6",
  },
  [DVLA_FIXTURE_FEW]: {
    make: "FORD",
    fuelType: "PETROL",
    yearOfManufacture: 2020,
    engineCapacity: 999,
    co2Emissions: 115,
    euroStatus: "EURO 6",
  },
  [DVLA_FIXTURE_NONE]: {
    make: "FORD",
    fuelType: "DIESEL",
    yearOfManufacture: 2014,
    engineCapacity: 2000,
    co2Emissions: 180,
    euroStatus: "EURO 5",
  },
  [DVLA_FIXTURE_BEV]: {
    make: "NISSAN",
    fuelType: "ELECTRICITY",
    yearOfManufacture: 2019,
    co2Emissions: 0,
    euroStatus: "EURO 6",
  },
};

export const DVLA_FIXTURES = {
  ves: DVLA_VES_FIXTURES,
};
