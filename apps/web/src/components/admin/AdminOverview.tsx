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
  const workerOk = (data?.worker ?? "").toLowerCase() === "ok" || data?.worker === "ok";
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
          value={data?.stuckImportCount ?? 0}
          label="Stuck imports"
          hint="Sampled"
          tone={(data?.stuckImportCount ?? 0) > 0 ? "danger" : "ok"}
        />
      </div>
      <AdminCard title="Health">
        {isPending ? (
          <AdminSkeletonList rows={2} />
        ) : (
          <div className="flex flex-wrap gap-2">
            <AdminStatus tone={workerOk ? "ok" : "danger"}>
              Worker {data?.worker ?? "unknown"}
            </AdminStatus>
            <AdminStatus tone={data?.db ? "ok" : "danger"}>{data?.db ? "Neon ok" : "Neon error"}</AdminStatus>
            <span className="text-xs text-text-muted">Sample cap {data?.sampledAccounts ?? 0}</span>
          </div>
        )}
      </AdminCard>
      <AdminCard title="Flags">
        {isPending ? (
          <AdminSkeletonList rows={2} />
        ) : (
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
