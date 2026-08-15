export type AdminNavGroup = "Workspace" | "Accounts" | "Jobs" | "Diagnostics";

export type AdminNavIcon =
  | "layout"
  | "flag"
  | "home"
  | "users"
  | "credit"
  | "play"
  | "upload"
  | "download"
  | "mail"
  | "map"
  | "chart"
  | "scroll"
  | "code";

export type AdminNavItem = {
  to: string;
  label: string;
  title: string;
  group: AdminNavGroup;
  icon: AdminNavIcon;
};

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = ["Workspace", "Accounts", "Jobs", "Diagnostics"];

export const ADMIN_NAV: AdminNavItem[] = [
  { to: "/admin", label: "Overview", title: "Admin overview", group: "Workspace", icon: "layout" },
  { to: "/admin/flags", label: "Flags", title: "Signup and feature kill switches", group: "Workspace", icon: "flag" },
  { to: "/admin/me", label: "My tenant", title: "Your own tenant counts", group: "Workspace", icon: "home" },
  { to: "/admin/users", label: "Users", title: "Account directory", group: "Accounts", icon: "users" },
  { to: "/admin/billing", label: "Billing", title: "Subscription status rollup", group: "Accounts", icon: "credit" },
  { to: "/admin/demo", label: "Demo", title: "Demo account status", group: "Accounts", icon: "play" },
  { to: "/admin/imports", label: "Imports", title: "Cross-account import jobs", group: "Jobs", icon: "upload" },
  { to: "/admin/exports", label: "Exports", title: "GDPR pack job status", group: "Jobs", icon: "download" },
  { to: "/admin/email", label: "Email", title: "Transactional email catalog", group: "Jobs", icon: "mail" },
  { to: "/admin/maps", label: "Maps", title: "Map vendor configuration", group: "Jobs", icon: "map" },
  { to: "/admin/analytics", label: "Analytics", title: "Product metrics", group: "Diagnostics", icon: "chart" },
  { to: "/admin/audit", label: "Audit", title: "Staff action log", group: "Diagnostics", icon: "scroll" },
  { to: "/admin/developer", label: "Developer", title: "Live diagnostics checks", group: "Diagnostics", icon: "code" },
];

export function adminPageLabel(pathname: string): string {
  const exact = ADMIN_NAV.find((item) => item.to === pathname);
  if (exact) return exact.label;
  if (pathname.startsWith("/admin/users/")) return "User";
  return "Admin";
}
