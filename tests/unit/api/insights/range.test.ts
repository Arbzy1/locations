import { describe, expect, it } from "vitest";
import { getRangeInsights, sameRangeLastYear } from "@locations/api/catalog";

describe("sameRangeLastYear", () => {
  it("shifts both ends back a year", () => {
    expect(sameRangeLastYear("2025-03-01", "2025-03-31")).toEqual({ from: "2024-03-01", to: "2024-03-31" });
  });

  it("maps 29 February to 28 February", () => {
    expect(sameRangeLastYear("2024-02-01", "2024-02-29")).toEqual({ from: "2023-02-01", to: "2023-02-28" });
  });
});

describe("getRangeInsights validation", () => {
  it("rejects bad or overlong ranges before touching the database", async () => {
    const db = {} as never;
    expect(await getRangeInsights(db, "t1", { from: "2024-02-01", to: "2024-01-01" })).toHaveProperty("error");
    expect(await getRangeInsights(db, "t1", { from: "2000-01-01", to: "2024-01-01" })).toHaveProperty("error");
  });
});
