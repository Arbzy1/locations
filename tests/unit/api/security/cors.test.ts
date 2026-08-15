import { describe, expect, it } from "vitest";
import { corsOriginFor, allowedOrigins } from "@locations/api/cors";
import type { Env } from "@locations/api/env";

const env = {
  BETTER_AUTH_URL: "https://locations.aden.website",
  DATABASE_URL: "postgres://x",
  BETTER_AUTH_SECRET: "x",
} as Env;

describe("cors allowlist", () => {
  it("allows only BETTER_AUTH_URL in production", () => {
    expect(allowedOrigins(env)).toEqual(["https://locations.aden.website"]);
    expect(corsOriginFor(env, "http://localhost:5173")).toBeNull();
    expect(corsOriginFor(env, "https://locations.aden.website")).toBe(
      "https://locations.aden.website",
    );
  });

  it("allows local Vite/API origins when BETTER_AUTH_URL is loopback", () => {
    const local = { ...env, BETTER_AUTH_URL: "http://127.0.0.1:8787" };
    expect(corsOriginFor(local, "http://localhost:5173")).toBe("http://localhost:5173");
    expect(corsOriginFor(local, "http://127.0.0.1:8787")).toBe("http://127.0.0.1:8787");
  });

  it("rejects arbitrary origins", () => {
    expect(corsOriginFor(env, "https://evil.example")).toBeNull();
    expect(corsOriginFor(env, "https://locations.aden.website.evil.com")).toBeNull();
  });
});
