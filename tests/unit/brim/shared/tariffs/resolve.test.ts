import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EV_NETWORK_TABLE } from "\@locations/brim/shared/tariffs/table.js";
import { homeTariffPence, pickNetworkTariff, resolveEvPrice } from "\@locations/brim/shared/tariffs/resolve.js";

describe("homeTariffPence", () => {
  it("prefers off-peak when set", () => {
    const picked = homeTariffPence({ peakPence: 28, offpeakPence: 7, offpeakWindow: "00:30-05:30" });
    expect(picked.pence).toBe(7);
    expect(picked.reason).toMatch(/off-peak home rate \(00:30-05:30\)/);
    expect(picked.reason).toMatch(/Leave time is not charge time/);
  });

  it("uses peak when off-peak is missing", () => {
    expect(homeTariffPence({ peakPence: 28 }).pence).toBe(28);
    expect(homeTariffPence({ peakPence: 28 }).reason).toBeUndefined();
  });
});

describe("pickNetworkTariff", () => {
  it("matches by id and prefers DC when speed is omitted", () => {
    const row = pickNetworkTariff(EV_NETWORK_TABLE, "bp-pulse-dc", undefined);
    expect(row?.network).toBe("BP Pulse");
    expect(row?.speed).toBe("dc");
    expect(row?.pencePerKwh).toBe(79);
  });

  it("matches by name and speed", () => {
    const ac = pickNetworkTariff(EV_NETWORK_TABLE, "BP Pulse", "ac");
    expect(ac?.id).toBe("bp-pulse-ac");
    expect(ac?.pencePerKwh).toBe(49);
  });
});

describe("resolveEvPrice", () => {
  it("uses the home fallback instead of a fake national median", () => {
    const resolved = resolveEvPrice({});
    expect(resolved.source).toBe("hardcoded-fallback");
    expect(resolved.pence).toBe(7.5);
    expect(resolved.charging).toBe("acHome");
    expect(resolved.warning?.code).toBe("price-data-unavailable");
  });

  it("uses a user home tariff and off-peak when present", () => {
    const resolved = resolveEvPrice({ peakPence: 28, offpeakPence: 7.5 });
    expect(resolved.source).toBe("user-tariff");
    expect(resolved.pence).toBe(7.5);
    expect(resolved.reason).toMatch(/off-peak/);
  });

  it("uses the network table for public DC", () => {
    const resolved = resolveEvPrice({
      chargingLocation: "public",
      network: "ionity",
      chargingSpeed: "dc",
    });
    expect(resolved.source).toBe("network-table");
    expect(resolved.pence).toBe(74);
    expect(resolved.charging).toBe("dcRapid");
  });

  it("falls back loudly when the public network is unknown", () => {
    const resolved = resolveEvPrice({ chargingLocation: "public", network: "not-a-network" });
    expect(resolved.source).toBe("hardcoded-fallback");
    expect(resolved.pence).toBe(70);
    expect(resolved.charging).toBe("dcRapid");
  });
});

describe("EV_NETWORK_TABLE", () => {
  it("matches data/tariffs/networks.json", () => {
    const path = join(dirname(fileURLToPath(import.meta.url)), "../../../../../data/brim/tariffs/networks.json");
    const disk = JSON.parse(readFileSync(path, "utf8")) as unknown;
    expect(disk).toEqual(EV_NETWORK_TABLE);
  });
});
