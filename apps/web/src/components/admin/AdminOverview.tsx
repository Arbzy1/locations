import { useQuery } from "@tanstack/react-query";
import { adminJson } from "../../lib/admin-api";
import { AdminCard, AdminError, AdminSection } from "./AdminSection";

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
  const { data, isError } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => adminJson<Overview>("/api/admin/overview"),
  });
  if (isError) return <AdminError />;
  const roles = data?.users.byRole ?? {};
  return (
    <AdminSection
      title="Overview"
      description="Worker health, kill switches, and account counts. No maps of other tenants."
    >
      <AdminCard title="Health">
        <ul className="space-y-1 text-sm">
          <li>Worker: {data?.worker ?? "…"}</li>
          <li>Neon: {data ? (data.db ? "ok" : "error") : "…"}</li>
        </ul>
      </AdminCard>
      <AdminCard title="Flags">
        <ul className="space-y-1 text-sm">
          <li>Signup disabled: {String(data?.flags.signupDisabled ?? false)}</li>
          <li>Landing: {String(data?.flags.landingEnabled ?? true)}</li>
          <li>Globe: {String(data?.flags.globeEnabled ?? true)}</li>
          <li>Demo tour: {String(data?.flags.demoTour ?? true)}</li>
        </ul>
      </AdminCard>
      <AdminCard title="Accounts">
        <ul className="space-y-1 text-sm">
          <li>Total: {data?.users.total ?? 0}</li>
          {Object.entries(roles).map(([role, count]) => (
            <li key={role}>
              {role}: {count}
            </li>
          ))}
          <li>Entitled (sampled): {data?.entitledCount ?? 0}</li>
          <li>Lapsed (sampled): {data?.lapsedCount ?? 0}</li>
          <li>Stuck imports (sampled): {data?.stuckImportCount ?? 0}</li>
          <li>Sample cap: {data?.sampledAccounts ?? 0}</li>
        </ul>
      </AdminCard>
    </AdminSection>
  );
}
