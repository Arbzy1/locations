import { describe, expect, it } from "vitest";
import { allowedOrigins, corsOriginFor } from "@locations/api/cors";
import type { Env } from "@locations/api/env";

const prod = {
  BETTER_AUTH_URL: "https://locations.aden.website",
  DATABASE_URL: "postgres://x",
  BETTER_AUTH_SECRET: "x",
} as Env;

describe("CORS production allowlist", () => {
  it("does not include localhost when BETTER_AUTH_URL is a public origin", () => {
    const origins = allowedOrigins(prod);
    expect(origins.some((o) => o.includes("localhost") || o.includes("127.0.0.1"))).toBe(false);
    expect(corsOriginFor(prod, "http://localhost:5173")).toBeNull();
    expect(corsOriginFor(prod, "https://evil.example")).toBeNull();
  });
});
