import type { CarbonIntensityPeriod } from "../carbon/types.js";

export const CARBON_INTENSITY_FIXTURE_NOW = "2026-08-16T12:00:00Z";

/** Half-hourly national GB rows around the Fuel Finder fixture clock. */
export const CARBON_INTENSITY_FIXTURES: CarbonIntensityPeriod[] = [
  {
    region: "GB",
    intensityGPerKwh: 185,
    validFrom: "2026-08-16T11:30:00.000Z",
    validTo: "2026-08-16T12:00:00.000Z",
    source: "actual",
  },
  {
    region: "GB",
    intensityGPerKwh: 190,
    validFrom: "2026-08-16T12:00:00.000Z",
    validTo: "2026-08-16T12:30:00.000Z",
    source: "forecast",
  },
  {
    region: "GB",
    intensityGPerKwh: 210,
    validFrom: "2026-08-16T12:30:00.000Z",
    validTo: "2026-08-16T13:00:00.000Z",
    source: "forecast",
  },
];
