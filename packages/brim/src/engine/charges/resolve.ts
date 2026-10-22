import type { Charge, ChargeScheme, VehicleKind, VehicleProfile, Warning } from '../../shared/index.js';
import { complianceForZone } from "./compliance.js";
import { daysWindowApplies } from "./windows.js";

export type ChargeHitInput = {
  scheme: ChargeScheme;
  relation: "intersects" | "near";
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

function penceFor(scheme: ChargeScheme, kind: VehicleKind): number {
  if (scheme.chargePenceByClass) {
    const byClass = scheme.chargePenceByClass[kind];
    if (byClass !== undefined) return byClass;
    if (scheme.chargePenceByClass.car !== undefined) return scheme.chargePenceByClass.car;
  }
  return scheme.chargePence ?? 0;
}

function kindOf(vehicle: VehicleProfile | undefined): VehicleKind {
  return vehicle?.kind ?? "car";
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

export function resolveCharges(input: ResolveChargesInput): ResolveChargesResult {
  const charges: Charge[] = [];
  const warnings: Warning[] = [];
  const reasons: string[] = [];
  const nearMisses: Array<{ id: string; name: string }> = [];
  const kind = kindOf(input.vehicle);
  const seen = new Set<string>();

  for (const hit of input.hits) {
    const scheme = hit.scheme;
    if (hit.relation === "near") {
      nearMisses.push({ id: scheme.id, name: scheme.name });
      pushUnique(warnings, {
        code: "near-miss",
        message: `Route passes close to ${scheme.name}.`,
        severity: "info",
      });
      continue;
    }

    const days = daysWindowApplies(scheme.appliesHours, input.departsAt, input.durationSeconds);
    if (days.length === 0) {
      reasons.push(`${scheme.name} window does not apply at this departure.`);
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

    const restriction = compliance.verdict === "restriction";
    const amount = restriction ? 0 : penceFor(scheme, kind);
    const perCrossing = scheme.schemeKind === "toll";
    const dates = perCrossing ? days.slice(0, 1) : days;

    for (const date of dates) {
      const id = perCrossing ? scheme.id : `${scheme.id}:${date}`;
      if (seen.has(id)) continue;
      seen.add(id);
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
