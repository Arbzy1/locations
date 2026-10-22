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
 * Better Auth account mutations. The demo login is shared, so one visitor
 * changing its password, email, or name would break or deface it for everyone.
 * Session revoke stays allowed (see docs/architecture/auth-and-billing.md);
 * the worst case is another visitor clicking "Try the demo" again.
 */
const DEMO_BLOCKED_AUTH_PATHS = new Set([
  "/api/auth/change-password",
  "/api/auth/change-email",
  "/api/auth/update-user",
  "/api/auth/delete-user",
  "/api/auth/link-social",
  "/api/auth/unlink-account",
]);

export function isDemoBlockedAuthPath(method: string, path: string): boolean {
  return method === "POST" && DEMO_BLOCKED_AUTH_PATHS.has(path.replace(/\/+$/, ""));
}
