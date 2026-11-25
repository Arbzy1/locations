import type {
  Charge,
  ChargePenceByClass,
  ChargeScheme,
  Propulsion,
  VehicleKind,
  VehicleProfile,
  Warning,
} from "../../shared/index.js";
import { complianceForZone } from "./compliance.js";
import { daysWindowApplies, windowApplies } from "./windows.js";

export type ChargeHitInput = {
  scheme: ChargeScheme;
  relation: "intersects" | "near";
  entryFraction?: number | undefined;
  exitFraction?: number | undefined;
};

export type ResolveChargesInput = {
  hits: ChargeHitInput[];
  vehicle?: VehicleProfile | undefined;
  departsAt: string;
  durationSeconds: number;
};

export type ResolveChargesResult = {
  charges: Charge[];
  warnings: Warning[];
  reasons: string[];
  nearMisses: Array<{ id: string; name: string }>;
};

function classAmount(byClass: ChargePenceByClass | undefined, kind: VehicleKind): number | undefined {
  if (!byClass) return undefined;
  if (byClass[kind] !== undefined) return byClass[kind];
  return byClass.car;
}

function meetsLowEmissionZez(propulsion: Propulsion, kind: VehicleKind, euro: number | undefined): boolean {
  if (euro === undefined) return false;
  if (kind === "motorcycle") return euro >= 3;
  if (propulsion === "diesel") return euro >= 6;
  return euro >= 4;
}

function penceFor(
  scheme: ChargeScheme,
  kind: VehicleKind,
  propulsion: Propulsion,
  euro: number | undefined,
  crossingIso: string,
): number {
  if (scheme.id === "oxford-zez") {
    return meetsLowEmissionZez(propulsion, kind, euro) ? 400 : (scheme.chargePence ?? 1000);
  }
  if (scheme.peakHours && scheme.offpeakChargePenceByClass) {
    if (!windowApplies(scheme.peakHours, crossingIso)) {
      const offpeak = classAmount(scheme.offpeakChargePenceByClass, kind);
      if (offpeak !== undefined) return offpeak;
    }
  }
  const byClass = classAmount(scheme.chargePenceByClass, kind);
  if (byClass !== undefined) return byClass;
  return scheme.chargePence ?? 0;
}

function kindOf(vehicle: VehicleProfile | undefined): VehicleKind {
  return vehicle?.kind ?? "car";
}

function propulsionOf(vehicle: VehicleProfile | undefined): Propulsion {
  return vehicle?.propulsion ?? "petrol";
}

function chargeKind(scheme: ChargeScheme, restriction: boolean): Charge["kind"] {
  if (restriction) return "restriction";
  if (scheme.schemeKind === "toll") return "toll";
  return "zone_charge";
}

function pushUnique(warnings: Warning[], next: Warning) {
  if (warnings.some((w) => w.code === next.code && w.message === next.message)) return;
  warnings.push(next);
}

function crossingInstantIso(departsAt: string, durationSeconds: number, entryFraction?: number): string {
  const baseMs = Date.parse(departsAt);
  if (!Number.isFinite(baseMs)) return departsAt;
  const frac =
    entryFraction !== undefined && Number.isFinite(entryFraction)
      ? Math.max(0, Math.min(1, entryFraction))
      : 0;
  return new Date(baseMs + frac * Math.max(0, durationSeconds) * 1000).toISOString();
}

export function resolveCharges(input: ResolveChargesInput): ResolveChargesResult {
  const charges: Charge[] = [];
  const warnings: Warning[] = [];
  const reasons: string[] = [];
  const nearMisses: Array<{ id: string; name: string }> = [];
  const kind = kindOf(input.vehicle);
  const propulsion = propulsionOf(input.vehicle);
  const seen = new Set<string>();
  const tollCrossings = new Map<string, number>();

  for (const hit of input.hits) {
    const scheme = hit.scheme;
    if (hit.relation === "near") {
      if (!nearMisses.some((m) => m.id === scheme.id)) {
        nearMisses.push({ id: scheme.id, name: scheme.name });
      }
      pushUnique(warnings, {
        code: "near-miss",
        message: `Route passes close to ${scheme.name}.`,
        severity: "info",
      });
      continue;
    }

    const days = daysWindowApplies(
      scheme.appliesHours,
      input.departsAt,
      input.durationSeconds,
      hit.entryFraction !== undefined
        ? { entryFraction: hit.entryFraction, exitFraction: hit.exitFraction }
        : undefined,
    );
    if (days.length === 0) {
      reasons.push(`${scheme.name} window does not apply at this crossing time.`);
      continue;
    }

    const compliance = complianceForZone({ vehicle: input.vehicle, zone: scheme });
    if (compliance.euro.derived && compliance.needsEuro) {
      pushUnique(warnings, {
        code: "derived-euro",
        message:
          "Euro standard is derived from fuel type and year, not from DVLA. Check with the operator.",
        severity: "warning",
      });
    }
    if (compliance.verdict === "unknown" || (compliance.needsEuro && compliance.euro.euro === undefined)) {
      pushUnique(warnings, {
        code: "unknown-euro",
        message:
          "Euro standard is unknown. This estimate assumes the vehicle is not exempt. Check with the operator.",
        severity: "warning",
      });
    }

    if (compliance.verdict === "not_charged") {
      reasons.push(
        compliance.euro.source === "dvla"
          ? `${scheme.name} does not apply to this vehicle (DVLA Euro status).`
          : `${scheme.name} likely does not apply; check with the operator.`,
      );
      continue;
    }

    const crossingIso = crossingInstantIso(input.departsAt, input.durationSeconds, hit.entryFraction);
    const restriction = compliance.verdict === "restriction";
    const amount = restriction ? 0 : penceFor(scheme, kind, propulsion, compliance.euro.euro, crossingIso);
    if (!restriction && amount <= 0) {
      reasons.push(`${scheme.name} is free for this vehicle.`);
      continue;
    }

    const perCrossing = scheme.schemeKind === "toll";
    const dates = perCrossing ? days.slice(0, 1) : days;

    for (const date of dates) {
      let id: string;
      if (perCrossing) {
        const count = (tollCrossings.get(scheme.id) ?? 0) + 1;
        tollCrossings.set(scheme.id, count);
        id = count === 1 ? scheme.id : `${scheme.id}:${count}`;
      } else {
        id = `${scheme.id}:${date}`;
        if (seen.has(id)) continue;
        seen.add(id);
      }

      const charge: Charge = {
        id,
        kind: chargeKind(scheme, restriction),
        name: scheme.name,
        pence: amount,
        operatorUrl: scheme.operatorUrl,
      };
      if (restriction) {
        charge.note = "Your vehicle cannot enter this zone.";
        pushUnique(warnings, {
          code: "restriction",
          message: "Your vehicle cannot enter this zone.",
          severity: "blocking",
        });
      }
      charges.push(charge);
      if (restriction) {
        reasons.push(`${scheme.name} is a prohibition, not a price.`);
      } else {
        reasons.push(`${scheme.name}: £${(amount / 100).toFixed(2)}${perCrossing ? "" : ` on ${date}`}.`);
      }
    }
  }

  return { charges, warnings, reasons, nearMisses };
}
