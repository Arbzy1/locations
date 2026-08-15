import { describe, expect, it } from "vitest";
import { computeActivityGuesses, computeBadges, guessActivityLabel } from "@locations/db";
import type { ActivityRow, VisitRow } from "@locations/db";

function visit(partial: Partial<VisitRow> & { date: string; start: string }): VisitRow {
  return {
    id: partial.id ?? 1,
    tenant: "t",
    sourceId: "s",
    start: partial.start,
    end: partial.end ?? partial.start,
    date: partial.date,
    lat: partial.lat ?? 40.7,
    lon: partial.lon ?? -74,
    cluster: partial.cluster ?? "place",
    semanticType: partial.semanticType ?? "Unknown",
    placeId: null,
    durationMinutes: partial.durationMinutes ?? 60,
  };
}

function activity(
  partial: Partial<ActivityRow> & { date: string; start: string },
): ActivityRow {
  return {
    id: partial.id ?? 1,
    tenant: "t",
    sourceId: "s",
    start: partial.start,
    end: partial.end ?? partial.start,
    date: partial.date,
    startLat: 40.7,
    startLon: -74,
    endLat: 40.8,
    endLon: -74,
    mode: partial.mode ?? "car",
    distanceMeters: partial.distanceMeters ?? 10_000,
    durationMinutes: 30,
  };
}

describe("guessActivityLabel", () => {
  it("labels a long home dwell as at home", () => {
    expect(
      guessActivityLabel({
        semanticType: "Home",
        durationMinutes: 480,
        start: "2024-06-01T22:00:00Z",
      }),
    ).toEqual({ id: "home_long", label: "At home" });
  });

  it("labels a restaurant dwell as a meal", () => {
    expect(
      guessActivityLabel({
        semanticType: "Restaurant",
        durationMinutes: 45,
        start: "2024-06-01T12:00:00Z",
      }),
    ).toEqual({ id: "meal", label: "A meal" });
  });

  it("does not put coordinates in the label", () => {
    const guess = guessActivityLabel({
      semanticType: "Unknown",
      durationMinutes: 10,
      start: "2024-06-01T08:00:00Z",
    });
    expect(JSON.stringify(guess)).not.toMatch(/-?\d+\.\d+/);
  });
});

describe("computeActivityGuesses", () => {
  it("counts labels without cluster names", () => {
    const rows = computeActivityGuesses([
      visit({ id: 1, date: "2024-06-01", start: "2024-06-01T22:00:00Z", semanticType: "Home", durationMinutes: 500, cluster: "Secret" }),
      visit({ id: 2, date: "2024-06-01", start: "2024-06-01T22:10:00Z", semanticType: "Home", durationMinutes: 500, cluster: "Other" }),
    ]);
    expect(rows[0]?.id).toBe("home_long");
    expect(rows[0]?.count).toBe(2);
    expect(JSON.stringify(rows)).not.toContain("Secret");
  });
});

describe("computeBadges", () => {
  it("computes coverage and first-import badge", () => {
    const dates = ["2024-01-01", "2024-01-02", "2024-01-04"];
    const summary = computeBadges({
      visits: dates.map((date, i) => visit({ id: i + 1, date, start: `${date}T12:00:00Z` })),
      activities: [
        activity({
          date: "2024-01-01",
          start: "2024-01-01T12:00:00Z",
          mode: "walking",
          distanceMeters: 90_000,
        }),
      ],
      allDates: dates,
    });
    expect(summary.spanDays).toBe(4);
    expect(summary.daysWithData).toBe(3);
    expect(summary.coveragePercent).toBe(75);
    expect(summary.badges.find((b) => b.id === "first_import")?.earned).toBe(true);
    expect(summary.badges.find((b) => b.id === "walker")?.earned).toBe(true);
    expect(summary.visitCount).toBe(3);
  });
});
