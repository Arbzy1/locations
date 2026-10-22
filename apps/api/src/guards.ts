/** Auth / role guards shared by API routes and unit tests. */

export type GuardUser = {
  id: string;
  email: string;
  name: string;
  role: string;
} | null;

export function blockDemo(user: GuardUser): { error: string } | null {
  if (user?.role === "demo") {
    return { error: "Demo accounts cannot import or manage data sources" };
  }
  return null;
}

/**
 * Better Auth routes the shared demo login may not use. Account mutations would
 * break or deface it for everyone; the session list would show other visitors'
 * IP addresses and browsers, and revoke would sign them out.
 */
const DEMO_BLOCKED_AUTH_PATHS: Record<string, Set<string>> = {
  POST: new Set([
    "/api/auth/change-password",
    "/api/auth/change-email",
    "/api/auth/update-user",
    "/api/auth/delete-user",
    "/api/auth/link-social",
    "/api/auth/unlink-account",
    "/api/auth/revoke-session",
    "/api/auth/revoke-sessions",
    "/api/auth/revoke-other-sessions",
  ]),
  GET: new Set(["/api/auth/list-sessions"]),
};

export function isDemoBlockedAuthPath(method: string, path: string): boolean {
  return DEMO_BLOCKED_AUTH_PATHS[method]?.has(path.replace(/\/+$/, "")) ?? false;
}
