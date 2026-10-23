import { describe, expect, it } from "vitest";
import { computeTenantAggregates, type ActivityRow, type VisitRow } from "@locations/db";

const visit = (id: number, start: string, cluster: string): VisitRow => ({
  id,
  tenant: "t",
  sourceId: "s",
  start,
  end: start,
  date: start.slice(0, 10),
  lat: 51.5,
  lon: -0.1,
  cluster,
  semanticType: "Unknown",
  placeId: null,
  durationMinutes: 30,
  fixLat: null,
  fixLon: null,
  fixCount: null,
  placeKey: null,
  googleName: null,
});
const trip = (id: number, start: string): ActivityRow => ({
  id,
  tenant: "t",
  sourceId: "s",
  start,
  end: start,
  date: start.slice(0, 10),
  startLat: 51.5,
  startLon: -0.1,
  endLat: 52,
  endLon: -1,
  mode: "car",
  distanceMeters: 60_000,
  durationMinutes: 45,
  path: null,
});

describe("computeTenantAggregates", () => {
  it("does not depend on the order rows come back from the database", () => {
    const visits = [
      visit(1, "2023-11-11T08:00:00Z", "51.5°N 0.5°W"),
      visit(2, "2023-11-11T12:00:00Z", "52.5°N 1.0°W"),
      visit(3, "2023-11-11T18:00:00Z", "53.0°N 1.0°W"),
      visit(4, "2023-11-12T09:00:00Z", "51.5°N 0.5°W"),
    ];
    const trips = [trip(1, "2023-11-11T10:00:00Z"), trip(2, "2023-11-11T15:00:00Z")];
    const inOrder = computeTenantAggregates("t", visits, trips);
    const shuffled = computeTenantAggregates("t", [visits[2], visits[0], visits[3], visits[1]], [trips[1], trips[0]]);
    expect(JSON.stringify(shuffled)).toBe(JSON.stringify(inOrder));
    expect(inOrder.dayStats[0].clusters).toEqual(["51.5°N 0.5°W", "52.5°N 1.0°W", "53.0°N 1.0°W"]);
  });

  it("leaves out analytics with nothing to show", () => {
    const { analytics } = computeTenantAggregates("t", [visit(1, "2023-11-11T08:00:00Z", "a")], []);
    expect(Object.values(analytics).every((v) => v !== null && v !== undefined)).toBe(true);
  });
});
