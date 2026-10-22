import { EV_NETWORK_TABLE } from "./table.js";
import type {
  ChargingLocation,
  ChargingSpeed,
  EvNetworkTable,
  EvNetworkTariff,
  ResolvedEvPrice,
} from "./types.js";

function verifiedAt(isoDate: string): string {
  return `${isoDate}T00:00:00Z`;
}

function chargingForSpeed(speed: ChargingSpeed): "acHome" | "dcRapid" {
  return speed === "dc" ? "dcRapid" : "acHome";
}

export function homeTariffPence(input: {
  peakPence: number;
  offpeakPence?: number;
  offpeakWindow?: string;
}): { pence: number; reason?: string } {
  if (input.offpeakPence !== undefined && input.offpeakPence > 0) {
    const window = input.offpeakWindow?.trim();
    return {
      pence: input.offpeakPence,
      reason: window
        ? `Used your off-peak home rate (${window}). Leave time is not charge time.`
        : "Used your off-peak home rate.",
    };
  }
  return { pence: input.peakPence };
}

export function pickNetworkTariff(
  table: EvNetworkTable,
  network: string | undefined,
  speed: ChargingSpeed | undefined,
): EvNetworkTariff | undefined {
  if (!network) return undefined;
  const needle = network.trim().toLowerCase();
  const matches = table.networks.filter(
    (row) => row.id.toLowerCase() === needle || row.network.toLowerCase() === needle,
  );
  if (matches.length === 0) return undefined;
  if (speed) {
    const exact = matches.find((row) => row.speed === speed);
    if (exact) return exact;
  }
  return matches.find((row) => row.speed === "dc") ?? matches[0];
}

function fallbackPrice(
  table: EvNetworkTable,
  location: ChargingLocation,
): ResolvedEvPrice {
  const row = location === "public" ? table.fallbacks.public : table.fallbacks.home;
  const charging = location === "public" ? "dcRapid" : "acHome";
  return {
    pence: row.pencePerKwh,
    source: "hardcoded-fallback",
    observedAt: verifiedAt(row.verified_on),
    charging,
    reason:
      location === "public"
        ? `No public-network price for that charger, so we used a dated ${row.pencePerKwh} p/kWh fallback.`
        : `No home tariff entered, so we used a dated ${row.pencePerKwh} p/kWh fallback.`,
    warning: {
      code: "price-data-unavailable",
      message: "EV charging prices are estimates. Enter your home tariff or pick a network.",
      severity: "warning",
    },
  };
}

export function resolveEvPrice(input: {
  chargingLocation?: ChargingLocation;
  network?: string;
  chargingSpeed?: ChargingSpeed;
  pricePence?: number;
  peakPence?: number;
  offpeakPence?: number;
  offpeakWindow?: string;
  table?: EvNetworkTable;
}): ResolvedEvPrice {
  const table = input.table ?? EV_NETWORK_TABLE;
  const location = input.chargingLocation ?? "home";

  if (location === "public") {
    const speed = input.chargingSpeed;
    const picked = pickNetworkTariff(table, input.network, speed);
    if (picked) {
      const pence =
        input.pricePence !== undefined && input.pricePence > 0 ? input.pricePence : picked.pencePerKwh;
      const resolved: ResolvedEvPrice = {
        pence,
        source: "network-table",
        observedAt: verifiedAt(picked.verified_on),
        charging: chargingForSpeed(picked.speed),
        reason: `Used the dated ${picked.network} ${picked.speed.toUpperCase()} average from the public-network table.`,
      };
      return resolved;
    }
    if (input.pricePence !== undefined && input.pricePence > 0) {
      return {
        pence: input.pricePence,
        source: "network-table",
        observedAt: verifiedAt(table.verified_on),
        charging: chargingForSpeed(speed ?? "dc"),
        reason: "Used the public charging price you entered.",
      };
    }
    return fallbackPrice(table, "public");
  }

  const peak = input.pricePence ?? input.peakPence;
  const offpeak =
    input.offpeakPence !== undefined && input.offpeakPence > 0 ? input.offpeakPence : undefined;
  if (peak !== undefined && peak > 0) {
    const chosen = homeTariffPence({
      peakPence: peak,
      ...(offpeak !== undefined ? { offpeakPence: offpeak } : {}),
      ...(input.offpeakWindow ? { offpeakWindow: input.offpeakWindow } : {}),
    });
    const resolved: ResolvedEvPrice = {
      pence: chosen.pence,
      source: "user-tariff",
      observedAt: verifiedAt(table.verified_on),
      charging: "acHome",
      reason: chosen.reason ?? "Used your home tariff.",
    };
    return resolved;
  }

  return fallbackPrice(table, "home");
}
