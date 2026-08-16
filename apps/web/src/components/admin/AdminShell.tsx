import { useState, type ComponentType } from "react";
import { Link, useLocation } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Menu,
  Shield,
  LayoutDashboard,
  Flag,
  Home,
  Users,
  CreditCard,
  Play,
  Upload,
  Download,
  Mail,
  Map,
  BarChart3,
  ScrollText,
  Activity,
  Code,
} from "lucide-react";
import { useSession } from "../../lib/auth";
import { enterMotion } from "../../lib/motion";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { AppVersionLink } from "../shell/AppVersion";
import { Sheet, SheetContent } from "../ui/sheet";
import { ADMIN_NAV, ADMIN_NAV_GROUPS, type AdminNavIcon } from "./adminNav";
import { AdminStatus, roleStatus } from "./AdminUi";
import { AdminOverviewPage } from "./AdminOverview";
import { AdminFlagsPage } from "./AdminFlags";
import { AdminUsersPage, AdminUserDetailPage } from "./AdminUsers";
import { AdminBillingPage } from "./AdminBilling";
import { AdminImportsPage } from "./AdminImports";
import { AdminExportsPage } from "./AdminExports";
import { AdminEmailPage } from "./AdminEmail";
import { AdminMapsPage } from "./AdminMaps";
import { AdminDemoPage } from "./AdminDemo";
import { AdminAnalyticsPage } from "./AdminAnalytics";
import { AdminAuditPage } from "./AdminAudit";
import { AdminDiagnosticsPage } from "./AdminDiagnostics";
import { AdminDeveloperPage } from "./AdminDeveloper";
import { AdminMePage } from "./AdminMe";

const ICONS: Record<AdminNavIcon, ComponentType<{ size?: number }>> = {
  layout: LayoutDashboard,
  flag: Flag,
  home: Home,
  users: Users,
  credit: CreditCard,
  play: Play,
  upload: Upload,
  download: Download,
  mail: Mail,
  map: Map,
  chart: BarChart3,
  scroll: ScrollText,
  pulse: Activity,
  code: Code,
};

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const reduce = useReducedMotion();
  return (
    <nav className="flex flex-col gap-4">
      {ADMIN_NAV_GROUPS.map((group) => (
        <div key={group}>
          <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wide text-text-muted">{group}</p>
          <div className="flex flex-col gap-1">
            {ADMIN_NAV.filter((item) => item.group === group).map((item, index) => {
              const active =
                item.to === "/admin"
                  ? pathname === "/admin"
                  : pathname === item.to || pathname.startsWith(`${item.to}/`);
              const Icon = ICONS[item.icon];
              return (
                <motion.div
                  key={item.to}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={reduce ? { duration: 0.08 } : { delay: index * 0.04, duration: 0.35 }}
                >
                  <Button
                    asChild
                    variant="ghost"
                    className={cn(
                      "relative h-11 w-full justify-start gap-2",
                      active && "text-admin hover:text-admin",
                    )}
                    title={item.title}
                  >
                    <Link to={item.to} onClick={onNavigate}>
                      {active && (
                        <motion.span
                          layoutId="admin-nav-pill"
                          className="absolute inset-0 rounded-lg bg-admin/15"
                          transition={reduce ? { duration: 0.08 } : { type: "spring", stiffness: 400, damping: 28 }}
                        />
                      )}
                      <span className="relative z-10 flex items-center gap-2">
                        <Icon size={16} />
                        {item.label}
                      </span>
                    </Link>
                  </Button>
                </motion.div>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function AdminOutlet() {
  const { pathname } = useLocation();
  if (pathname === "/admin") return <AdminOverviewPage />;
  if (pathname === "/admin/flags") return <AdminFlagsPage />;
  if (pathname === "/admin/users") return <AdminUsersPage />;
  if (pathname.startsWith("/admin/users/")) return <AdminUserDetailPage />;
  if (pathname === "/admin/billing") return <AdminBillingPage />;
  if (pathname === "/admin/imports") return <AdminImportsPage />;
  if (pathname === "/admin/exports") return <AdminExportsPage />;
  if (pathname === "/admin/email") return <AdminEmailPage />;
  if (pathname === "/admin/maps") return <AdminMapsPage />;
  if (pathname === "/admin/demo") return <AdminDemoPage />;
  if (pathname === "/admin/analytics") return <AdminAnalyticsPage />;
  if (pathname === "/admin/audit") return <AdminAuditPage />;
  if (pathname === "/admin/diagnostics") return <AdminDiagnosticsPage />;
  if (pathname === "/admin/developer") return <AdminDeveloperPage />;
  if (pathname === "/admin/me") return <AdminMePage />;
  return <p className="text-sm text-text-muted">This Admin page is not available.</p>;
}

export default function AdminShell() {
  const { pathname } = useLocation();
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const isStaff = role === "admin" || role === "developer";
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const headerMotion = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.08 } }
    : enterMotion;

  if (!isStaff) {
    return (
      <div className="h-full overflow-y-auto bg-surface p-6">
        <p className="text-sm text-text-muted">Not found.</p>
      </div>
    );
  }

  const roleMeta = roleStatus(role ?? "user");
  const email = session?.user?.email ?? "";

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <motion.header
        {...headerMotion}
        className="shrink-0 border-b border-admin/30 bg-admin/10 px-4 py-3 sm:px-6"
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-h-11 items-center gap-2 text-admin">
            <Shield size={20} />
            <h1 className="font-display text-lg font-semibold">Admin panel</h1>
          </div>
          <AdminStatus tone={roleMeta.tone}>
            {role === "developer" ? "Read-only" : roleMeta.label}
          </AdminStatus>
          {email && <span className="truncate text-xs text-text-muted">{email}</span>}
          <AppVersionLink className="text-text-muted hover:text-accent" />
          <Button asChild variant="outline" size="sm" className="ml-auto" title="Back to Timeline">
            <Link to="/hotspots">Back to Timeline</Link>
          </Button>
        </div>
        <p className="mt-2 text-xs text-text-muted">
          Accounts and flags only. You cannot open another user’s map.
        </p>
      </motion.header>
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-56 shrink-0 overflow-y-auto border-r border-border p-3 lg:block">
          <NavLinks />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2 lg:hidden">
            <Button
              type="button"
              variant="outline"
              size="icon"
              title="Open Admin menu"
              aria-label="Open Admin menu"
              onClick={() => setOpen(true)}
            >
              <Menu size={16} />
            </Button>
            <h2 className="text-sm font-semibold text-admin">Admin</h2>
          </div>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetContent side="left" title="Admin menu">
              <NavLinks onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={pathname}
                className="mx-auto max-w-5xl space-y-4"
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
                transition={reduce ? { duration: 0.08 } : { duration: 0.4 }}
              >
                <AdminOutlet />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
