import { describe, expect, it } from "vitest";
import { arrivalCopy } from "\@locations/brim/shared/copy/arrival.js";

describe("arrivalCopy", () => {
  it("uses spec comfortable copy", () => {
    expect(arrivalCopy({ percent: 34.2, verdict: "comfortable" })).toBe("You'll arrive with about 34%.");
  });

  it("uses spec tight copy with a hyphen", () => {
    expect(arrivalCopy({ percent: 14.4, verdict: "tight" })).toBe(
      "Tight - about 14% on arrival. Worth a top-up.",
    );
  });

  it("uses spec insufficient copy with shortfall kWh", () => {
    expect(arrivalCopy({ percent: -2, verdict: "insufficient", shortfallKwh: 18.2 })).toBe(
      "You won't make it without charging. You'll need roughly 18 kWh on the way.",
    );
  });
});
