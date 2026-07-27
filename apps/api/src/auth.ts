import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createDb } from "@locations/db";
import type { Env } from "./env";

export function createAuth(env: Env) {
  const db = createDb(env.DATABASE_URL);
  return betterAuth({
    database: drizzleAdapter(db, { provider: "pg" }),
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
    },
    user: {
      additionalFields: {
        role: {
          type: "string",
          required: false,
          defaultValue: "user",
          input: false,
        },
      },
    },
    trustedOrigins: [
      env.BETTER_AUTH_URL,
      "http://localhost:5173",
      "http://localhost:8787",
      "http://127.0.0.1:5173",
      "http://127.0.0.1:8787",
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
