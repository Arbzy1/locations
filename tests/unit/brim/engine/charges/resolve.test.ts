import { describe, expect, it } from "vitest";
import {
  CHARGE_JOURNEY_SET,
  HOURS_LONDON_CC,
  journeyHits,
  schemeById,
} from "@locations/brim/shared";
import {
  complianceForZone,
  localDaysTouched,
  resolveCharges,
  windowApplies,
} from "\@locations/brim/engine/charges/index.js";

describe("charge windows", () => {
  it("uses Europe/London including BST", () => {
    expect(windowApplies(HOURS_LONDON_CC, "2026-08-14T07:30:00Z")).toBe(true);
    expect(windowApplies(HOURS_LONDON_CC, "2026-08-14T17:30:00Z")).toBe(false);
  });

  it("skips Christmas Day", () => {
    expect(windowApplies(HOURS_LONDON_CC, "2026-12-25T10:00:00Z")).toBe(false);
  });

  it("treats bank holidays as weekend CC hours", () => {
    expect(windowApplies(HOURS_LONDON_CC, "2026-08-31T10:00:00Z")).toBe(false);
    expect(windowApplies(HOURS_LONDON_CC, "2026-08-31T12:30:00Z")).toBe(true);
  });

  it("lists both local dates across midnight", () => {
    const days = localDaysTouched("2026-08-14T22:30:00+01:00", 3 * 3600);
    expect(days).toEqual(["2026-08-14", "2026-08-15"]);
  });

  it("applies Monday CC hours in BST the day after the spring-forward", () => {
    expect(windowApplies(HOURS_LONDON_CC, "2026-03-30T06:00:00Z")).toBe(true);
    expect(windowApplies(HOURS_LONDON_CC, "2026-03-30T17:00:00Z")).toBe(false);
  });

  it("applies Monday CC hours after the autumn clock change", () => {
    expect(windowApplies(HOURS_LONDON_CC, "2026-10-26T07:00:00Z")).toBe(true);
    expect(windowApplies(HOURS_LONDON_CC, "2026-10-26T18:00:00Z")).toBe(false);
  });
});

describe("compliance", () => {
  const ulez = schemeById("london-ulez")!;
  const cazC = schemeById("bath-caz")!;
  const lez = schemeById("glasgow-lez")!;

  it("charges diesel Euro 5 in ULEZ and not petrol Euro 4", () => {
    expect(
      complianceForZone({
        vehicle: { kind: "car", propulsion: "diesel", euroStatus: "Euro 5" },
        zone: ulez,
      }).verdict,
    ).toBe("charged");
    expect(
      complianceForZone({
        vehicle: { kind: "car", propulsion: "petrol", euroStatus: "Euro 4" },
        zone: ulez,
      }).verdict,
    ).toBe("not_charged");
  });

  it("does not charge cars in CAZ C and does charge vans", () => {
    const diesel5 = { euroStatus: "Euro 5" as const, propulsion: "diesel" as const };
    expect(complianceForZone({ vehicle: { kind: "car", ...diesel5 }, zone: cazC }).verdict).toBe(
      "not_charged",
    );
    expect(complianceForZone({ vehicle: { kind: "van", ...diesel5 }, zone: cazC }).verdict).toBe(
      "charged",
    );
  });

  it("models Glasgow LEZ as a restriction, not a price", () => {
    const result = resolveCharges({
      hits: [{ scheme: lez, relation: "intersects" }],
      vehicle: { kind: "car", propulsion: "diesel", euroStatus: "Euro 5" },
      departsAt: "2026-08-14T08:00:00Z",
      durationSeconds: 3600,
    });
    expect(result.charges).toEqual([
      expect.objectContaining({ id: expect.stringContaining("glasgow-lez"), pence: 0, kind: "restriction" }),
    ]);
    expect(result.warnings.some((w) => w.code === "restriction")).toBe(true);
  });
});

describe("forty-journey charge set", () => {
  it("has 40 cases", () => {
    expect(CHARGE_JOURNEY_SET).toHaveLength(40);
  });

  it("scores 100% on windows, compliance, and dedup", () => {
    for (const journey of CHARGE_JOURNEY_SET) {
      const result = resolveCharges({
        hits: journeyHits(journey),
        vehicle: journey.vehicle,
        departsAt: journey.departsAt,
        durationSeconds: journey.durationSeconds,
      });
      const byScheme = new Map<string, { pence: number; count: number; kinds: string[] }>();
      for (const charge of result.charges) {
        const schemeId = charge.id.split(":")[0] ?? charge.id;
        const cur = byScheme.get(schemeId) ?? { pence: 0, count: 0, kinds: [] };
        cur.pence += charge.pence;
        cur.count += 1;
        cur.kinds.push(charge.kind);
        byScheme.set(schemeId, cur);
      }
      expect(byScheme.size, journey.id).toBe(journey.expected.length);
      for (const expected of journey.expected) {
        const got = byScheme.get(expected.schemeId);
        expect(got, `${journey.id} missing ${expected.schemeId}`).toBeDefined();
        expect(got?.pence, journey.id).toBe(expected.pence);
        expect(got?.count, journey.id).toBe(expected.count ?? 1);
        if (expected.kind) expect(got?.kinds.every((k) => k === expected.kind)).toBe(true);
      }
      for (const code of journey.expectedWarningCodes ?? []) {
        expect(
          result.warnings.some((w) => w.code === code),
          `${journey.id} warning ${code}`,
        ).toBe(true);
      }
    }
  });
});
