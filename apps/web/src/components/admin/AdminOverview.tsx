import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { adminJson } from "../../lib/admin-api";
import { AdminCard, AdminError, AdminSection } from "./AdminSection";
import { AdminEmpty, AdminSkeletonList, AdminStat, AdminStatus, boolStatus } from "./AdminUi";

type Overview = {
  worker: string;
  db: boolean;
  flags: {
    signupDisabled: boolean;
    landingEnabled: boolean;
    globeEnabled: boolean;
    demoTour: boolean;
  };
  users: { total: number; byRole: Record<string, number> };
  stuckImportCount: number;
  entitledCount: number;
  lapsedCount: number;
  sampledAccounts: number;
  attention: {
    stuckImportCount: number;
    pastDueCount: number;
    unverifiedCount: number;
    adminCount: number;
  };
  diagnostics: {
    stripeConfigured: boolean;
    resendConfigured: boolean;
    r2Configured: boolean;
    queueConfigured: boolean;
  };
};

export function AdminOverviewPage() {
  const { data, isError, isPending } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => adminJson<Overview>("/api/admin/overview"),
  });
  if (isError) return <AdminError />;
  const flags = [
    { on: data?.flags.signupDisabled ?? false, label: "Signup disabled" },
    { on: data?.flags.landingEnabled ?? true, label: "Landing" },
    { on: data?.flags.globeEnabled ?? true, label: "Globe" },
    { on: data?.flags.demoTour ?? true, label: "Demo tour" },
  ];
  const workerOk = (data?.worker ?? "").toLowerCase() === "ok";
  const adminCount = data?.attention.adminCount ?? 0;
  const diag = [
    { on: Boolean(data?.diagnostics.stripeConfigured), label: "Stripe" },
    { on: Boolean(data?.diagnostics.resendConfigured), label: "Resend" },
    { on: Boolean(data?.diagnostics.r2Configured), label: "R2" },
    { on: Boolean(data?.diagnostics.queueConfigured), label: "Queue" },
  ];
  return (
    <AdminSection
      title="Overview"
      description="Worker health, kill switches, and account counts. No maps of other tenants."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStat loading={isPending} value={data?.users.total ?? 0} label="Accounts" hint="All roles" />
        <AdminStat loading={isPending} value={data?.entitledCount ?? 0} label="Entitled" hint="Sampled" tone="ok" />
        <AdminStat
          loading={isPending}
          value={data?.lapsedCount ?? 0}
          label="Lapsed"
          hint="Sampled"
          tone={(data?.lapsedCount ?? 0) > 0 ? "warn" : "neutral"}
        />
        <AdminStat
          loading={isPending}
          value={adminCount}
          label="Admins"
          hint={adminCount === 1 ? "Last admin: demote and wipe are blocked" : "Exact count"}
          tone={adminCount === 1 ? "warn" : "neutral"}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Link to="/admin/imports?status=stuck" title="Open stuck imports" className="block">
          <AdminStat
            loading={isPending}
            value={data?.attention.stuckImportCount ?? 0}
            label="Stuck imports"
            hint="Sampled. Open to unlock."
            tone={(data?.attention.stuckImportCount ?? 0) > 0 ? "danger" : "ok"}
          />
        </Link>
        <Link to="/admin/users?billing=past_due" title="Open past due accounts" className="block">
          <AdminStat
            loading={isPending}
            value={data?.attention.pastDueCount ?? 0}
            label="Past due"
            hint="Sampled"
            tone={(data?.attention.pastDueCount ?? 0) > 0 ? "danger" : "ok"}
          />
        </Link>
        <Link to="/admin/users?verified=false" title="Open unverified accounts" className="block">
          <AdminStat
            loading={isPending}
            value={data?.attention.unverifiedCount ?? 0}
            label="Unverified"
            hint="Exact count"
            tone={(data?.attention.unverifiedCount ?? 0) > 0 ? "warn" : "ok"}
          />
        </Link>
      </div>
      <AdminCard title="Health">
        {isPending ? (
          <AdminSkeletonList rows={2} />
        ) : (
          <div className="flex flex-wrap gap-2">
            <AdminStatus tone={workerOk ? "ok" : "danger"}>Worker {data?.worker ?? "unknown"}</AdminStatus>
            <AdminStatus tone={data?.db ? "ok" : "danger"}>{data?.db ? "Neon ok" : "Neon error"}</AdminStatus>
            {diag.map((item) => (
              <AdminStatus key={item.label} tone={item.on ? "ok" : "warn"}>
                {item.label} {item.on ? "set" : "missing"}
              </AdminStatus>
            ))}
            <span className="text-xs text-text-muted">Sample cap {data?.sampledAccounts ?? 0}</span>
          </div>
        )}
      </AdminCard>
      <AdminCard title="Flags">
        {isPending ? (
          <AdminSkeletonList rows={2} />
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {flags.map((flag) => {
                const status = boolStatus(flag.on, flag.label, flag.label);
                return (
                  <Link key={flag.label} to="/admin/flags" title="Open flags" className="inline-flex">
                    <AdminStatus tone={flag.on ? "warn" : "neutral"}>{status.label}</AdminStatus>
                  </Link>
                );
              })}
            </div>
            {data?.flags.signupDisabled && (
              <p className="text-xs text-text-muted">
                Public signup is closed. Invite waitlisted people from Users. CLI: npm run auth:create-user.
              </p>
            )}
          </div>
        )}
      </AdminCard>
      <AdminCard title="Roles">
        {isPending ? (
          <AdminSkeletonList rows={3} />
        ) : Object.keys(data?.users.byRole ?? {}).length === 0 ? (
          <AdminEmpty>No accounts yet.</AdminEmpty>
        ) : (
          <div className="flex flex-wrap gap-2">
            {Object.entries(data?.users.byRole ?? {}).map(([role, count]) => (
              <AdminStatus key={role} tone={role === "admin" ? "warn" : "neutral"}>
                {role} {count}
              </AdminStatus>
            ))}
          </div>
        )}
      </AdminCard>
    </AdminSection>
  );
}
