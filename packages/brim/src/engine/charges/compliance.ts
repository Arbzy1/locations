import type { ChargeScheme, Propulsion, VehicleKind, VehicleProfile } from '../../shared/index.js';
import { resolveEuro, type EuroResolution } from "./euro.js";

export type ComplianceVerdict = "charged" | "not_charged" | "restriction" | "unknown";

export type ComplianceResult = {
  verdict: ComplianceVerdict;
  euro: EuroResolution;
  needsEuro: boolean;
};

function vehicleKind(vehicle: VehicleProfile | undefined): VehicleKind {
  return vehicle?.kind ?? "car";
}

function propulsionOf(vehicle: VehicleProfile | undefined): Propulsion {
  return vehicle?.propulsion ?? "petrol";
}

function meetsCleanAirEuro(propulsion: Propulsion, kind: VehicleKind, euro: number): boolean {
  if (kind === "motorcycle") return euro >= 3;
  if (propulsion === "diesel") return euro >= 6;
  return euro >= 4;
}

export function complianceForZone(input: {
  vehicle?: VehicleProfile | undefined;
  zone: ChargeScheme;
}): ComplianceResult {
  const vehicle = input.vehicle;
  const kind = vehicleKind(vehicle);
  const propulsion = propulsionOf(vehicle);
  const euro = resolveEuro({
    propulsion,
    kind,
    ...(vehicle?.euroStatus ? { euroStatus: vehicle.euroStatus } : {}),
    ...(vehicle?.euroStatusSource ? { euroStatusSource: vehicle.euroStatusSource } : {}),
    ...(vehicle?.year !== undefined ? { year: vehicle.year } : {}),
  });
  const zone = input.zone;

  if (zone.schemeKind === "toll") {
    return { verdict: "charged", euro, needsEuro: false };
  }

  if (zone.schemeKind === "congestion") {
    if (kind === "motorcycle") return { verdict: "not_charged", euro, needsEuro: false };
    return { verdict: "charged", euro, needsEuro: false };
  }

  if (propulsion === "bev") {
    return { verdict: "not_charged", euro, needsEuro: false };
  }

  if (zone.schemeKind === "caz" && zone.cazClass === "C" && kind !== "van") {
    return { verdict: "not_charged", euro, needsEuro: false };
  }

  const restriction = zone.isRestriction || zone.schemeKind === "lez";
  if (euro.euro === undefined) {
    return { verdict: restriction ? "restriction" : "unknown", euro, needsEuro: true };
  }

  const ok = meetsCleanAirEuro(propulsion, kind, euro.euro);
  if (ok) return { verdict: "not_charged", euro, needsEuro: true };
  if (restriction) return { verdict: "restriction", euro, needsEuro: true };
  return { verdict: "charged", euro, needsEuro: true };
}
