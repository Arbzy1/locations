import { describe, expect, it } from "vitest";
import { filterHiddenAnalytics } from "@locations/api/services";

describe("filterHiddenAnalytics", () => {
  const hidden = new Set(["secret"]);

  it("drops hidden lapsed places and firsts", () => {
    const lapsed = filterHiddenAnalytics(
      "lapsed-places",
      [
        { cluster: "secret", lastDate: "2020-01-01", years: 4 },
        { cluster: "park", lastDate: "2021-01-01", years: 3 },
      ],
      hidden,
    ) as { cluster: string }[];
    expect(lapsed.map((p) => p.cluster)).toEqual(["park"]);

    const firsts = filterHiddenAnalytics(
      "firsts",
      { clusters: [{ name: "secret", date: "2024-01-01" }, { name: "cafe", date: "2024-02-01" }], types: [] },
      hidden,
    ) as { clusters: { name: string }[] };
    expect(firsts.clusters.map((c) => c.name)).toEqual(["cafe"]);
  });

  it("filters year-in-review maps", () => {
    const filtered = filterHiddenAnalytics(
      "year-in-review",
      {
        "2024": {
          year: 2024,
          top_places: [["secret", 3], ["park", 2]],
          firsts: [{ cluster: "secret", date: "2024-01-01" }],
          trips: [{ clusters: ["secret", "park"] }],
        },
      },
      hidden,
    ) as Record<string, { top_places: [string, number][]; firsts: { cluster: string }[]; trips: { clusters: string[] }[] }>;
    expect(filtered["2024"].top_places).toEqual([["park", 2]]);
    expect(filtered["2024"].firsts).toEqual([]);
    expect(filtered["2024"].trips[0].clusters).toEqual(["park"]);
  });
});
