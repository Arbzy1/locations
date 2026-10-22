import { describe, expect, it } from "vitest";
import { isRealPlaceKey } from "@locations/api/catalog";
import { visitPlaceKey } from "@locations/db";

describe("place keys", () => {
  it("tell real places from older region keys", () => {
    expect(isRealPlaceKey(visitPlaceKey("ChIJabc", 1, 2))).toBe(true);
    expect(isRealPlaceKey(visitPlaceKey(null, 51.5004, -0.1))).toBe(true);
    expect(isRealPlaceKey("51.5°N 0.0°W")).toBe(false);
  });

  it("snap nearby stays without a place id to one key", () => {
    expect(visitPlaceKey(null, 51.50012, -0.10031)).toBe(visitPlaceKey(null, 51.50021, -0.10044));
    expect(visitPlaceKey(null, 51.5, -0.1)).not.toBe(visitPlaceKey(null, 51.502, -0.1));
  });
});
