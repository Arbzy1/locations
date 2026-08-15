import { authClient } from "../auth";

export type DeviceSession = {
  id: string;
  token: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  createdAt: Date | string;
  expiresAt: Date | string;
};

type SessionResult = {
  data?: DeviceSession[] | null;
  error?: { message?: string } | null;
};

type AuthSessionClient = typeof authClient & {
  listSessions: () => Promise<SessionResult>;
  revokeSession: (opts: { token: string }) => Promise<{ error?: { message?: string } | null }>;
  revokeOtherSessions: () => Promise<{ error?: { message?: string } | null }>;
};

function sessionApi(): AuthSessionClient {
  return authClient as AuthSessionClient;
}

/** Short device label for Settings. Never include the session token. */
export function summarizeUserAgent(ua: string | null | undefined): string {
  if (!ua?.trim()) return "Unknown device";
  const s = ua;
  let browser = "Browser";
  if (/Edg\//i.test(s)) browser = "Edge";
  else if (/Chrome\//i.test(s) && !/Chromium/i.test(s)) browser = "Chrome";
  else if (/Firefox\//i.test(s)) browser = "Firefox";
  else if (/Safari\//i.test(s) && !/Chrome/i.test(s)) browser = "Safari";

  let os = "Unknown OS";
  if (/Windows NT|Windows/i.test(s)) os = "Windows";
  else if (/Mac OS X|Macintosh/i.test(s)) os = "macOS";
  else if (/Android/i.test(s)) os = "Android";
  else if (/iPhone|iPad|iPod|iOS/i.test(s)) os = "iOS";
  else if (/Linux/i.test(s)) os = "Linux";

  return `${browser} on ${os}`;
}

export function formatSessionTime(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export async function listDeviceSessions(): Promise<{
  sessions: DeviceSession[];
  error?: string;
}> {
  const result = await sessionApi().listSessions();
  if (result.error) {
    return { sessions: [], error: result.error.message || "Could not list sessions" };
  }
  return { sessions: result.data ?? [] };
}

export async function revokeDeviceSession(token: string): Promise<{ error?: string }> {
  const result = await sessionApi().revokeSession({ token });
  if (result.error) {
    return { error: result.error.message || "Could not revoke session" };
  }
  return {};
}

export async function revokeOtherDeviceSessions(): Promise<{ error?: string }> {
  const result = await sessionApi().revokeOtherSessions();
  if (result.error) {
    return { error: result.error.message || "Could not revoke other sessions" };
  }
  return {};
}
