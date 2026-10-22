import { describe, expect, it } from "vitest";
import { computeEstimate } from "\@locations/brim/engine/index.js";

describe("computeEstimate charge summing", () => {
  it("adds charge pence onto energy and does not re-decide windows", () => {
    const base = computeEstimate({
      distanceMeters: 100_000,
      propulsion: "petrol",
      userEntered: { value: 6, unit: "l/100km" },
      pricePence: 140,
      priceUnit: "ppl",
      priceSource: "national-median",
      priceObservedAt: "2026-08-14T08:00:00Z",
    });
    const withCharges = computeEstimate({
      distanceMeters: 100_000,
      propulsion: "petrol",
      userEntered: { value: 6, unit: "l/100km" },
      pricePence: 140,
      priceUnit: "ppl",
      priceSource: "national-median",
      priceObservedAt: "2026-08-14T08:00:00Z",
      charges: [
        { id: "london-ulez:2026-08-14", kind: "zone_charge", name: "London ULEZ", pence: 1250 },
        { id: "london-cc:2026-08-14", kind: "zone_charge", name: "Congestion Charge", pence: 1500 },
      ],
    });
    expect(withCharges.cost.chargesPence).toBe(2750);
    expect(withCharges.cost.energyPence.point).toBe(base.cost.energyPence.point);
    expect(withCharges.cost.totalPence.point).toBe(base.cost.energyPence.point + 2750);
    expect(withCharges.charges).toHaveLength(2);
  });
});
