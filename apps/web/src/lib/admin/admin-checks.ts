export type DeveloperCheck = {
  id: string;
  group: "Public" | "Session" | "Operator";
  label: string;
  url: string;
  title: string;
};

export const DEVELOPER_SAFE_CHECKS: DeveloperCheck[] = [
  { id: "health", group: "Public", label: "Health", url: "/api/health", title: "Check Worker and database ping" },
  { id: "config", group: "Public", label: "Config", url: "/api/config", title: "Check public flags without API keys" },
  { id: "me", group: "Session", label: "Me", url: "/api/me", title: "Check own session" },
  { id: "overview", group: "Session", label: "Overview counts", url: "/api/overview", title: "Own tenant counts only" },
  { id: "diagnostics", group: "Operator", label: "Diagnostics", url: "/api/admin/diagnostics", title: "Check operator diagnostics booleans" },
  { id: "admin-overview", group: "Operator", label: "Admin overview", url: "/api/admin/overview", title: "Check operator overview" },
  { id: "flags", group: "Operator", label: "Flags", url: "/api/admin/flags", title: "Check flag overlay" },
  { id: "users", group: "Operator", label: "Users", url: "/api/admin/users?limit=1", title: "Check user directory cap" },
  { id: "users-filter", group: "Operator", label: "Users filter", url: "/api/admin/users?verified=false&limit=1", title: "Check user list filters" },
  { id: "billing", group: "Operator", label: "Billing", url: "/api/admin/billing", title: "Check billing rollup" },
  { id: "imports", group: "Operator", label: "Imports", url: "/api/admin/imports", title: "Check import rollup" },
  { id: "imports-stuck", group: "Operator", label: "Stuck imports", url: "/api/admin/imports?status=stuck", title: "Check stuck import filter" },
  { id: "exports", group: "Operator", label: "Exports", url: "/api/admin/exports", title: "Check export rollup" },
  { id: "email", group: "Operator", label: "Email", url: "/api/admin/email", title: "Check email catalog" },
  { id: "demo", group: "Operator", label: "Demo", url: "/api/admin/demo", title: "Check demo account status" },
  { id: "stats", group: "Operator", label: "My tenant stats", url: "/api/admin/stats", title: "Check own tenant stats" },
  { id: "maps", group: "Operator", label: "Maps", url: "/api/admin/maps", title: "Check map vendor booleans" },
  { id: "maps-probe", group: "Operator", label: "Maps probe", url: "/api/admin/maps/probe", title: "Check map vendor probe" },
  { id: "analytics", group: "Operator", label: "Analytics", url: "/api/admin/analytics", title: "Check product metrics" },
  { id: "audit", group: "Operator", label: "Audit", url: "/api/admin/audit", title: "Check staff audit log" },
  { id: "audit-flags", group: "Operator", label: "Audit flags", url: "/api/admin/audit?action=flags", title: "Check audit action filter" },
];

const SECRET_OR_COORD = new RegExp(
  `("lat"|"lon"|"lng"|"latitude"|"longitude"|"cluster"|"placeId"|${"sk_"}|${"wh"}sec_|re_[A-Za-z0-9])`,
  "i",
);

export function responseFailsPrivacy(text: string): boolean {
  return SECRET_OR_COORD.test(text);
}

export function summarizeCheckBody(text: string): { ok: boolean; reason?: string } {
  if (responseFailsPrivacy(text)) {
    return { ok: false, reason: "Response looked like coordinates or a secret" };
  }
  return { ok: true };
}
