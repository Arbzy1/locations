import { describe, expect, it } from "vitest";
import { openMeteoForecastUrl, pickHourlyTemperature } from "\@locations/brim/shared/weather/open-meteo.js";

describe("openMeteoForecastUrl", () => {
  it("pins one UTC hour at the origin", () => {
    const url = openMeteoForecastUrl(51.11, -0.186, "2026-08-16T12:10:00Z");
    expect(url).toContain("latitude=51.11");
    expect(url).toContain("longitude=-0.186");
    expect(url).toContain("hourly=temperature_2m");
    expect(url).toContain("start_hour=2026-08-16T12%3A00");
    expect(url).toContain("timezone=UTC");
  });
});

describe("pickHourlyTemperature", () => {
  it("picks the closest hour within 90 minutes", () => {
    const temp = pickHourlyTemperature(
      {
        hourly: {
          time: ["2026-08-16T11:00", "2026-08-16T12:00"],
          temperature_2m: [9.1, 12.4],
        },
      },
      "2026-08-16T12:10:00Z",
    );
    expect(temp).toBe(12.4);
  });

  it("returns undefined when the payload is empty", () => {
    expect(pickHourlyTemperature({}, "2026-08-16T12:00:00Z")).toBeUndefined();
  });
});
