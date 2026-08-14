import { describe, expect, it } from "vitest";

const url = process.env.DATABASE_URL;

describe.skipIf(!url)("FORCE RLS (live DATABASE_URL)", () => {
  it("is configured for leak tests against Neon", () => {
    expect(url).toMatch(/postgres/i);
  });
});
