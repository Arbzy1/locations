import { describe, expect, it } from "vitest";
import { dayStats } from "@locations/db";
import { getOverview } from "@locations/api/services";

function overviewDb(opts: {
  visits: number;
  activities: number;
  miles: number;
  first: string | null;
  last: string | null;
  days: number;
  places: number;
}) {
  // One statement: day_stats aggregates plus scalar subqueries for the visit,
  // activity and distinct-place counts.
  return {
    select: () => ({
      from: (table: unknown) => ({
        where: () =>
          Promise.resolve(
            table === dayStats
              ? [
                  {
                    total: opts.miles,
                    first: opts.first,
                    last: opts.last,
                    days: opts.days,
                    visits: opts.visits,
                    activities: opts.activities,
                    places: opts.places,
                  },
                ]
              : [],
          ),
      }),
    }),
  } as never;
}

describe("getOverview", () => {
  it("returns min/max dates without loading every day row", async () => {
    const overview = await getOverview(
      overviewDb({
        visits: 10,
        activities: 4,
        miles: 12.34,
        first: "2020-01-02",
        last: "2024-12-31",
        days: 100,
        places: 7,
      }),
      "t1" as never,
    );
    expect(overview).toEqual({
      total_records: 14,
      total_visits: 10,
      total_activities: 4,
      total_distance_miles: 12.3,
      date_range: ["2020-01-02", "2024-12-31"],
      days_with_data: 100,
      unique_places: 7,
    });
  });

  it("returns an empty date range when there are no days", async () => {
    const overview = await getOverview(
      overviewDb({
        visits: 0,
        activities: 0,
        miles: 0,
        first: null,
        last: null,
        days: 0,
        places: 0,
      }),
      "t1" as never,
    );
    expect(overview.date_range).toEqual(["", ""]);
    expect(overview.days_with_data).toBe(0);
  });
});
