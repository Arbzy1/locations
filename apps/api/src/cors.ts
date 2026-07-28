import type { Env } from "./env";

const LOCAL_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:8787",
  "http://127.0.0.1:8787",
] as const;

/** Exact-match CORS allowlist. Never reflect arbitrary Origin values. */
export function allowedOrigins(env: Env): string[] {
  const base = env.BETTER_AUTH_URL.replace(/\/$/, "");
  return Array.from(new Set([base, ...LOCAL_ORIGINS]));
}

/** Returns the origin if allowed, otherwise null (deny). */
export function corsOriginFor(env: Env, origin: string | undefined): string | null {
  if (!origin) return null;
  return allowedOrigins(env).includes(origin) ? origin : null;
}
