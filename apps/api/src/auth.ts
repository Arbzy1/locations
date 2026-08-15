import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins/magic-link";
import { emailOTP } from "better-auth/plugins/email-otp";
import {
  account,
  createHttpDb,
  session,
  user,
  verification,
} from "@locations/db";
import type { Env } from "./env";
import { allowedOrigins } from "./cors";
import { sendEmail, isDemoRecipient } from "./email";
import type { EmailKind } from "./email";

function siteVars(env: Env) {
  return { siteUrl: env.BETTER_AUTH_URL.replace(/\/$/, "") };
}

async function sendAuthEmail(
  env: Env,
  kind: EmailKind,
  to: string,
  vars: { url?: string; otp?: string },
) {
  await sendEmail(env, {
    kind,
    to,
    vars: { ...vars, ...siteVars(env) },
    isDemo: isDemoRecipient(env, to),
  });
}

export function createAuth(env: Env) {
  const db = createHttpDb(env.DATABASE_URL);
  const secure = env.BETTER_AUTH_URL.startsWith("https://");
  const disableSignUp = env.DISABLE_SIGNUP === "true";

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user, session, account, verification },
    }),
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    emailAndPassword: {
      enabled: true,
      disableSignUp,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendAuthEmail(env, "password_reset_link", user.email, { url });
      },
      onPasswordReset: async ({ user }) => {
        await sendAuthEmail(env, "password_changed", user.email, {});
      },
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        await sendAuthEmail(env, "verify_email_link", user.email, { url });
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
        sendChangeEmailConfirmation: async ({ user, url }) => {
          await sendAuthEmail(env, "change_email_verify", user.email, { url });
        },
      },
    },
    plugins: [
      magicLink({
        disableSignUp: true,
        expiresIn: 60 * 5,
        sendMagicLink: async ({ email, url }) => {
          await sendAuthEmail(env, "magic_link", email, { url });
        },
      }),
      emailOTP({
        otpLength: 6,
        expiresIn: 300,
        disableSignUp: true,
        sendVerificationOnSignUp: true,
        storeOTP: "hashed",
        allowedAttempts: 3,
        sendVerificationOTP: async ({ email, otp, type }) => {
          const kind: EmailKind =
            type === "sign-in"
              ? "signin_otp"
              : type === "forget-password"
                ? "verify_email_otp"
                : "verify_email_otp";
          await sendAuthEmail(env, kind, email, { otp });
        },
      }),
    ],
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
