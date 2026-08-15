import { describe, expect, it } from "vitest";
import { parsePlaceColor, sanitizePlaceTags } from "@locations/api/place-labels";

describe("parsePlaceColor", () => {
  it("accepts allowlisted tokens and null", () => {
    expect(parsePlaceColor("visit")).toEqual({ ok: true, value: "visit" });
    expect(parsePlaceColor(null)).toEqual({ ok: true, value: null });
    expect(parsePlaceColor("")).toEqual({ ok: true, value: null });
  });

  it("rejects unknown colours and hex", () => {
    expect(parsePlaceColor("#ff00aa")).toEqual({ ok: false });
    expect(parsePlaceColor("red")).toEqual({ ok: false });
    expect(parsePlaceColor(1)).toEqual({ ok: false });
  });
});

describe("sanitizePlaceTags", () => {
  it("trims, caps length, and de-dupes", () => {
    const result = sanitizePlaceTags(["  Cafe ", "cafe", "x".repeat(40), ""]);
    expect(result).toEqual({ ok: true, value: ["Cafe", "x".repeat(24)] });
  });

  it("rejects non-arrays", () => {
    expect(sanitizePlaceTags("home")).toEqual({ ok: false });
  });
});
