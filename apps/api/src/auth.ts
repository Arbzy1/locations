import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createHttpDb } from "@locations/db";
import type { Env } from "./env";
import { allowedOrigins } from "./cors";
import { sendEmail } from "./email";

export function createAuth(env: Env) {
  const db = createHttpDb(env.DATABASE_URL);
  const secure = env.BETTER_AUTH_URL.startsWith("https://");
  const disableSignUp = env.DISABLE_SIGNUP === "true";

  return betterAuth({
    database: drizzleAdapter(db, { provider: "pg" }),
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    emailAndPassword: {
      enabled: true,
      disableSignUp,
      requireEmailVerification: !disableSignUp,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail(env, {
          to: user.email,
          subject: "Reset your Locations password",
          text: `Reset your password: ${url}`,
        });
      },
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmail(env, {
          to: user.email,
          subject: "Verify your Locations email",
          text: `Confirm your email: ${url}`,
        });
      },
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
      changeEmail: {
        enabled: true,
      },
    },
    trustedOrigins: allowedOrigins(env),
    advanced: {
      useSecureCookies: secure,
      defaultCookieAttributes: {
        httpOnly: true,
        secure,
        sameSite: "lax",
        path: "/",
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
