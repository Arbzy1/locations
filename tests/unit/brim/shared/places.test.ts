import { describe, expect, it } from "vitest";
import { reverseGazetteer, searchPlaces } from "\@locations/brim/shared/places.js";

describe("gazetteer", () => {
  it("substring-matches streets", () => {
    expect(searchPlaces("Station Road").some((p) => p.label === "Station Road, Crawley")).toBe(true);
  });

  it("does not invent a street far from towns", () => {
    const hit = reverseGazetteer(50, -5);
    expect(hit.label.startsWith("Pinned location")).toBe(true);
    expect(hit.label.includes("Crawley")).toBe(false);
  });
});
