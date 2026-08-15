import { describe, expect, it } from "vitest";
import { filterHiddenSearchPlaces } from "@locations/api/services";

describe("filterHiddenSearchPlaces", () => {
  it("omits hidden clusters from discovery results", () => {
    const hidden = new Set(["secret"]);
    const places = [
      { cluster: "secret", date: "2024-01-01" },
      { cluster: "park", date: "2024-02-01" },
    ];
    expect(filterHiddenSearchPlaces(places, hidden).map((p) => p.cluster)).toEqual(["park"]);
  });
});
