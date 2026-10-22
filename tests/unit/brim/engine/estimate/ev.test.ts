import { describe, expect, it } from "vitest";
import { arrivalStateOfCharge } from "\@locations/brim/engine/estimate/arrival.js";
import { estimateEv, temperatureFactor } from "\@locations/brim/engine/estimate/ev.js";

describe("EV energy", () => {
  it("bills 56.818… kWh from the grid for 50 kWh at 0.88 efficiency", () => {
    const ev = estimateEv({
      distanceMeters: 100_000,
      kwhPer100km: 50,
      pricePencePerKwh: 7,
      charging: "acHome",
      halfWidth: 0,
      tempC: 20,
      hasHeatPump: false,
      gridIntensityGPerKwh: 100,
    });
    expect(ev.batteryKwh.point).toBeCloseTo(50, 6);
    expect(ev.gridKwh.point).toBeCloseTo(50 / 0.88, 6);
    expect(ev.gridKwh.point).toBeCloseTo(56.8181818, 5);
    expect(ev.co2Kg).toBeCloseTo(5, 6);
  });

  it("bills DC on grid kWh at 0.94 efficiency", () => {
    const ev = estimateEv({
      distanceMeters: 100_000,
      kwhPer100km: 50,
      pricePencePerKwh: 70,
      charging: "dcRapid",
      halfWidth: 0,
      tempC: 20,
      hasHeatPump: false,
      gridIntensityGPerKwh: 100,
    });
    expect(ev.gridKwh.point).toBeCloseTo(50 / 0.94, 6);
    expect(ev.costPence.point).toBeCloseTo((50 / 0.94) * 70, 6);
  });

  it("applies temperature table at 0, 5 and 15°C", () => {
    expect(temperatureFactor(15, false).factor).toBe(1);
    expect(temperatureFactor(5, false).factor).toBe(1.1);
    expect(temperatureFactor(0, false).factor).toBe(1.25);
    expect(temperatureFactor(-1, false).factor).toBe(1.4);
    expect(temperatureFactor(-1, true).factor).toBe(1.2);
    expect(temperatureFactor(undefined, false).reason).toMatch(/No forecast/);
    expect(temperatureFactor(12, false).reason).toMatch(/12°C/);
    expect(temperatureFactor(12, false).reason).toMatch(/10%/);
    expect(temperatureFactor(2, true).reason).toMatch(/heat pump/i);
    expect(temperatureFactor(20, false).reason).toBeUndefined();
  });
});

describe("arrival SoC", () => {
  it("classifies exact 20% as tight and above as comfortable", () => {
    const c = arrivalStateOfCharge({ startPct: 80, batteryKwhUsed: 30, usableBatteryKwh: 50 });
    expect(c.percent).toBe(20);
    expect(c.verdict).toBe("tight");
    const ok = arrivalStateOfCharge({ startPct: 80, batteryKwhUsed: 29.5, usableBatteryKwh: 50 });
    expect(ok.percent).toBeGreaterThan(20);
    expect(ok.verdict).toBe("comfortable");
  });

  it("classifies exact 10% as tight and below as insufficient", () => {
    const t = arrivalStateOfCharge({ startPct: 50, batteryKwhUsed: 20, usableBatteryKwh: 50 });
    expect(t.percent).toBe(10);
    expect(t.verdict).toBe("tight");
    const i = arrivalStateOfCharge({ startPct: 50, batteryKwhUsed: 20.5, usableBatteryKwh: 50 });
    expect(i.percent).toBeLessThan(10);
    expect(i.verdict).toBe("insufficient");
    expect(i.shortfallKwh).toBeCloseTo((10 - i.percent) / 100 * 50, 10);
  });

  it("reports battery kWh needed when arrival is below empty", () => {
    const i = arrivalStateOfCharge({ startPct: 40, batteryKwhUsed: 30, usableBatteryKwh: 50 });
    expect(i.percent).toBe(-20);
    expect(i.verdict).toBe("insufficient");
    expect(i.shortfallKwh).toBeCloseTo(10, 10);
  });
});
