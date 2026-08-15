export type AdminNavItem = { to: string; label: string; title: string };

export const ADMIN_NAV: AdminNavItem[] = [
  { to: "/admin", label: "Overview", title: "Operator overview" },
  { to: "/admin/flags", label: "Flags", title: "Signup and feature kill switches" },
  { to: "/admin/users", label: "Users", title: "Account directory" },
  { to: "/admin/billing", label: "Billing", title: "Subscription status rollup" },
  { to: "/admin/imports", label: "Imports", title: "Cross-account import jobs" },
  { to: "/admin/exports", label: "Exports", title: "GDPR pack job status" },
  { to: "/admin/email", label: "Email", title: "Transactional email catalog" },
  { to: "/admin/maps", label: "Maps", title: "Map vendor configuration" },
  { to: "/admin/demo", label: "Demo", title: "Demo account status" },
  { to: "/admin/analytics", label: "Analytics", title: "Product metrics" },
  { to: "/admin/audit", label: "Audit", title: "Staff action log" },
  { to: "/admin/developer", label: "Developer", title: "Live diagnostics checks" },
  { to: "/admin/me", label: "My tenant", title: "Your own tenant counts" },
];
