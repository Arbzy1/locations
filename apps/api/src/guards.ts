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
