import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import { useSession } from "../../lib/auth";
import { Button } from "../ui/button";
import { Sheet, SheetContent } from "../ui/sheet";
import { ADMIN_NAV } from "./adminNav";
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
import { AdminDeveloperPage } from "./AdminDeveloper";
import { AdminMePage } from "./AdminMe";

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation();
  return (
    <nav className="flex flex-col gap-1">
      {ADMIN_NAV.map((item) => {
        const active =
          item.to === "/admin"
            ? pathname === "/admin"
            : pathname === item.to || pathname.startsWith(`${item.to}/`);
        return (
          <Button
            key={item.to}
            asChild
            variant={active ? "default" : "ghost"}
            className="h-11 w-full justify-start"
            title={item.title}
          >
            <Link to={item.to} onClick={onNavigate}>
              {item.label}
            </Link>
          </Button>
        );
      })}
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
  if (pathname === "/admin/developer") return <AdminDeveloperPage />;
  if (pathname === "/admin/me") return <AdminMePage />;
  return <p className="text-sm text-text-muted">This operator page is not available.</p>;
}

export default function AdminShell() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const isStaff = role === "admin" || role === "developer";
  const [open, setOpen] = useState(false);

  if (!isStaff) {
    return (
      <div className="h-full overflow-y-auto bg-surface p-6">
        <p className="text-sm text-text-muted">Not found.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 bg-surface">
      <aside className="hidden w-56 shrink-0 overflow-y-auto border-r border-border p-3 lg:block">
        <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
          Operator
        </p>
        <NavLinks />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2 lg:hidden">
          <Button
            type="button"
            variant="outline"
            size="icon"
            title="Open operator menu"
            aria-label="Open operator menu"
            onClick={() => setOpen(true)}
          >
            <Menu size={16} />
          </Button>
          <h2 className="text-sm font-semibold text-text">Operator</h2>
        </div>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" title="Operator menu">
            <NavLinks onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="mx-auto max-w-5xl space-y-4">
            <AdminOutlet />
          </div>
        </div>
      </div>
    </div>
  );
}
