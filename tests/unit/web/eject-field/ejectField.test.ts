import { describe, expect, it } from "vitest";
import { isControlFilled, usesSpacePlaceholder } from "@locations/web/lib/ejectField";

describe("isControlFilled", () => {
  it("treats empty text as rest", () => {
    expect(isControlFilled("")).toBe(false);
    expect(isControlFilled("   ")).toBe(false);
    expect(isControlFilled(null)).toBe(false);
    expect(isControlFilled(undefined)).toBe(false);
  });

  it("treats non-empty text as filled", () => {
    expect(isControlFilled("x")).toBe(true);
    expect(isControlFilled(" email@x ")).toBe(true);
  });

  it("treats an empty select value as rest and a real value as filled", () => {
    expect(isControlFilled("")).toBe(false);
    expect(isControlFilled("user")).toBe(true);
    expect(isControlFilled("all")).toBe(true);
  });

  it("treats an empty date as rest and a date value as filled", () => {
    expect(isControlFilled("")).toBe(false);
    expect(isControlFilled("2024-06-01")).toBe(true);
  });
});

describe("usesSpacePlaceholder", () => {
  it("uses a space placeholder on text-like inputs, not select or date", () => {
    expect(usesSpacePlaceholder(undefined, false)).toBe(true);
    expect(usesSpacePlaceholder("email", false)).toBe(true);
    expect(usesSpacePlaceholder("password", false)).toBe(true);
    expect(usesSpacePlaceholder("date", false)).toBe(false);
    expect(usesSpacePlaceholder("text", true)).toBe(false);
  });
});
