import { describe, expect, it } from "vitest";
import {
  chordTarget,
  isTypingTarget,
  parseCommandQuery,
  parseGps,
} from "@locations/web/lib/command-query";

describe("parseGps", () => {
  it("parses comma and space pairs", () => {
    expect(parseGps("51.5, -0.12")).toEqual({ lat: 51.5, lon: -0.12 });
    expect(parseGps("40.7 -74.0")).toEqual({ lat: 40.7, lon: -74 });
  });

  it("rejects out of range", () => {
    expect(parseGps("91, 0")).toBeNull();
    expect(parseGps("0, 181")).toBeNull();
  });
});

describe("parseCommandQuery", () => {
  it("classifies ISO dates, months, GPS, and text", () => {
    expect(parseCommandQuery("  ")).toEqual({ kind: "empty" });
    expect(parseCommandQuery("?")).toEqual({ kind: "help" });
    expect(parseCommandQuery("2024-06-15")).toEqual({ kind: "day", date: "2024-06-15" });
    expect(parseCommandQuery("2024-06")).toEqual({ kind: "month", ym: "2024-06" });
    expect(parseCommandQuery("51.5,-0.1")).toEqual({ kind: "gps", lat: 51.5, lon: -0.1 });
    expect(parseCommandQuery("Home")).toEqual({ kind: "text", q: "Home" });
  });
});

describe("chordTarget", () => {
  it("maps g-chords", () => {
    expect(chordTarget("h")).toBe("/hotspots");
    expect(chordTarget("d")).toBe("/day");
    expect(chordTarget("t")).toBe("/trips");
    expect(chordTarget("i")).toBe("/insights");
    expect(chordTarget("e")).toBe("/places");
    expect(chordTarget("s")).toBe("/settings");
    expect(chordTarget("x")).toBeNull();
  });
});

describe("isTypingTarget", () => {
  it("returns false for null", () => {
    expect(isTypingTarget(null)).toBe(false);
  });
});
