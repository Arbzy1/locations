import { describe, expect, it, vi } from "vitest";
import { testEnv } from "@tests/helpers/env";

const sendEmail = vi.fn(async () => "skipped" as const);

vi.mock("better-auth/adapters/drizzle", () => ({
  drizzleAdapter: () => () => ({ id: "mock-drizzle" }),
}));

vi.mock("@locations/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@locations/db")>();
  return {
    ...actual,
    createHttpDb: () => ({}),
  };
});

vi.mock("@locations/api/email", async () => {
  const actual = await vi.importActual<typeof import("@locations/api/email")>(
    "@locations/api/email",
  );
  return {
    ...actual,
    sendEmail: (...args: unknown[]) => sendEmail(...args),
  };
});

import { createAuth } from "@locations/api/auth";
import { googleAuthEnabled } from "@locations/api/env";

describe("Better Auth 1.6 config", () => {
  it("treats Google as configured only when both secrets are non-empty", () => {
    expect(googleAuthEnabled({})).toBe(false);
    expect(googleAuthEnabled({ GOOGLE_CLIENT_ID: "id" })).toBe(false);
    expect(googleAuthEnabled({ GOOGLE_CLIENT_ID: " id ", GOOGLE_CLIENT_SECRET: "  " })).toBe(false);
    expect(googleAuthEnabled({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "sec" })).toBe(true);
  });

  it("requires verification, revokes sessions on reset, and confirms email change to the current inbox", async () => {
    sendEmail.mockClear();
    const auth = createAuth(testEnv());
    const options = auth.options;

    expect(options.emailAndPassword?.requireEmailVerification).toBe(true);
    expect(options.emailAndPassword?.revokeSessionsOnPasswordReset).toBe(true);
    expect(options.user?.changeEmail?.enabled).toBe(true);
    expect(typeof options.user?.changeEmail?.sendChangeEmailConfirmation).toBe(
      "function",
    );
    expect(
      (options.user?.changeEmail as { sendChangeEmailVerification?: unknown })
        .sendChangeEmailVerification,
    ).toBeUndefined();
    expect(typeof auth.api.revokeOtherSessions).toBe("function");

    await options.user?.changeEmail?.sendChangeEmailConfirmation?.(
      {
        user: { email: "old@example.com" } as never,
        newEmail: "new@example.com",
        url: "http://127.0.0.1:8787/api/auth/verify-email?token=t",
        token: "t",
      },
      undefined,
    );

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0]?.[1]).toMatchObject({
      kind: "change_email_verify",
      to: "old@example.com",
    });
    expect(JSON.stringify(sendEmail.mock.calls)).not.toContain("new@example.com");
  });

  it("disables public signup when DISABLE_SIGNUP is true", () => {
    const auth = createAuth(testEnv({ DISABLE_SIGNUP: "true" }));
    expect(auth.options.emailAndPassword?.disableSignUp).toBe(true);
  });

  it("omits Google social login when either secret is missing", () => {
    const none = createAuth(testEnv());
    expect(none.options.socialProviders?.google).toBeUndefined();

    const idOnly = createAuth(testEnv({ GOOGLE_CLIENT_ID: "gid.apps.googleusercontent.com" }));
    expect(idOnly.options.socialProviders?.google).toBeUndefined();
  });

  it("enables Google with account linking and the signup kill switch", () => {
    const auth = createAuth(
      testEnv({
        GOOGLE_CLIENT_ID: "gid.apps.googleusercontent.com",
        GOOGLE_CLIENT_SECRET: "gsec",
        DISABLE_SIGNUP: "true",
      }),
    );
    expect(auth.options.socialProviders?.google).toMatchObject({
      clientId: "gid.apps.googleusercontent.com",
      clientSecret: "gsec",
      disableSignUp: true,
    });
    expect(auth.options.account?.accountLinking?.enabled).toBe(true);
    expect(auth.options.account?.accountLinking?.trustedProviders).toEqual(["google"]);
  });

  it("applies the ops overlay disableSignUp to Google", () => {
    const auth = createAuth(
      testEnv({
        GOOGLE_CLIENT_ID: "gid.apps.googleusercontent.com",
        GOOGLE_CLIENT_SECRET: "gsec",
      }),
      { disableSignUp: true },
    );
    expect(auth.options.socialProviders?.google?.disableSignUp).toBe(true);
    expect(auth.options.emailAndPassword?.disableSignUp).toBe(true);
  });

  it("maps Better Auth send callbacks to catalog kinds", async () => {
    sendEmail.mockClear();
    const auth = createAuth(testEnv());
    const options = auth.options;
    const user = { email: "a@example.com" } as never;
    const url = "http://127.0.0.1:8787/verify";

    await options.emailVerification?.sendVerificationEmail?.({ user, url, token: "t" }, undefined);
    await options.emailAndPassword?.sendResetPassword?.({ user, url, token: "t" }, undefined);
    await options.emailAndPassword?.onPasswordReset?.({ user }, undefined);

    const plugins = (options.plugins ?? []) as Array<{
      id?: string;
      options?: {
        sendMagicLink?: (ctx: { email: string; url: string }) => Promise<void>;
        sendVerificationOTP?: (ctx: {
          email: string;
          otp: string;
          type: string;
        }) => Promise<void>;
      };
    }>;
    const magic = plugins.find((p) => p.id === "magic-link" || p.options?.sendMagicLink);
    const otp = plugins.find((p) => p.id === "email-otp" || p.options?.sendVerificationOTP);
    await magic?.options?.sendMagicLink?.({ email: "a@example.com", url });
    await otp?.options?.sendVerificationOTP?.({
      email: "a@example.com",
      otp: "123456",
      type: "sign-in",
    });
    await otp?.options?.sendVerificationOTP?.({
      email: "a@example.com",
      otp: "654321",
      type: "email-verification",
    });

    const kinds = sendEmail.mock.calls.map((call) => (call[1] as { kind: string }).kind);
    expect(kinds).toEqual(
      expect.arrayContaining([
        "verify_email_link",
        "password_reset_link",
        "password_changed",
        "magic_link",
        "signin_otp",
        "verify_email_otp",
      ]),
    );
    expect(kinds).not.toContain("email_changed");
  });
});
