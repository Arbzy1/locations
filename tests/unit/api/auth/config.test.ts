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

describe("Better Auth 1.6 config", () => {
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
});
