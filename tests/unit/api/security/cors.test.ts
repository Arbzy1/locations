import { describe, expect, it } from "vitest";
import { corsOriginFor, allowedOrigins } from "@locations/api/cors";
import type { Env } from "@locations/api/env";

const env = {
  BETTER_AUTH_URL: "https://locations.aden.website",
  DATABASE_URL: "postgres://x",
  BETTER_AUTH_SECRET: "x",
} as Env;

describe("cors allowlist", () => {
  it("allows BETTER_AUTH_URL and local Vite/API origins", () => {
    expect(allowedOrigins(env)).toContain("https://locations.aden.website");
    expect(corsOriginFor(env, "http://localhost:5173")).toBe("http://localhost:5173");
    expect(corsOriginFor(env, "https://locations.aden.website")).toBe(
      "https://locations.aden.website",
    );
  });

  it("rejects arbitrary origins", () => {
    expect(corsOriginFor(env, "https://evil.example")).toBeNull();
    expect(corsOriginFor(env, "https://locations.aden.website.evil.com")).toBeNull();
  });
});
