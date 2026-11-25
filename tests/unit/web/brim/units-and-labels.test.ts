import { describe, expect, it } from "vitest";
import { vehicleChipLabel } from "@locations/web/lib/brim/estimate/vehicle-label";
import {
  formatBrimConsumption,
  formatBrimDistance,
  formatBrimDuration,
} from "@locations/web/lib/brim/units";

describe("vehicleChipLabel", () => {
  it("falls back past empty nickname or empty make/model instead of returning blank", () => {
    expect(
      vehicleChipLabel({
        vehicleId: "v-1",
        selected: { id: "v-1", nickname: "", make: "Honda", model: "Jazz", propulsion: "hybrid" },
        catalogue: null,
        propulsion: "petrol",
        vehicleKind: "car",
      }),
    ).toBe("Honda Jazz");

    expect(
      vehicleChipLabel({
        vehicleId: "v-2",
        selected: { id: "v-2", nickname: "   ", make: "", model: "", propulsion: "diesel" },
        catalogue: null,
        propulsion: "petrol",
        vehicleKind: "car",
      }),
    ).toBe("diesel");
  });
});

describe("Brim unit helpers", () => {
  it("formats route distance in miles and kilometres", () => {
    expect(formatBrimDistance(160934.4, "mi")).toBe("100.0 mi");
    expect(formatBrimDistance(160934.4, "km")).toBe("160.9 km");
  });

  it("formats driving duration cleanly", () => {
    expect(formatBrimDuration(2700)).toBe("45 min");
    expect(formatBrimDuration(3600)).toBe("1 h");
    expect(formatBrimDuration(5400)).toBe("1 h 30 min");
  });

  it("converts liquid and electric consumption between mi and km preferences", () => {
    expect(formatBrimConsumption(5.0, "l/100km", "km")).toBe("5.0 L/100km");
    expect(formatBrimConsumption(5.0, "l/100km", "mi")).toBe("56.5 mpg");
    expect(formatBrimConsumption(15.5, "kWh/100km", "km")).toBe("15.5 kWh/100km");
    expect(formatBrimConsumption(15.5, "kWh/100km", "mi")).toBe("4.0 mi/kWh");
  });
});
