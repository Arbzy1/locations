import { useQuery } from "@tanstack/react-query";
import { adminJson } from "../../lib/admin-api";
import { AdminCard, AdminError, AdminSection } from "./AdminSection";
import { AdminBars, AdminSkeletonList, AdminStat } from "./AdminUi";

type Analytics = {
  byRole: Record<string, number>;
  importsReady: number;
  importsError: number;
  recapOptIn: number;
  unverifiedCount: number;
  entitledCount: number;
  lapsedCount: number;
  sampledAccounts: number;
  signupsByWeek: { week: string; count: number }[];
};

export function AdminAnalyticsPage() {
  const { data, isError, isPending } = useQuery({
    queryKey: ["admin-analytics"],
    queryFn: () => adminJson<Analytics>("/api/admin/analytics"),
  });
  if (isError) return <AdminError />;
  return (
    <AdminSection title="Analytics" description="Product metrics. Not location analytics and not other people’s maps.">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStat loading={isPending} value={data?.importsReady ?? 0} label="Latest job ready" hint="Sampled" tone="ok" />
        <AdminStat
          loading={isPending}
          value={data?.importsError ?? 0}
          label="Latest job error"
          hint="Sampled"
          tone={(data?.importsError ?? 0) > 0 ? "danger" : "neutral"}
        />
        <AdminStat loading={isPending} value={data?.recapOptIn ?? 0} label="Recap opt-in" hint="Sampled" />
        <AdminStat loading={isPending} value={data?.unverifiedCount ?? 0} label="Unverified" hint="Exact count" tone={(data?.unverifiedCount ?? 0) > 0 ? "warn" : "ok"} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <AdminStat
          loading={isPending}
          value={data?.entitledCount ?? 0}
          label="Entitled"
          hint={`Sample cap ${data?.sampledAccounts ?? 100}`}
          tone="ok"
        />
        <AdminStat
          loading={isPending}
          value={data?.lapsedCount ?? 0}
          label="Lapsed"
          hint="Sampled accounts without entitlement"
          tone={(data?.lapsedCount ?? 0) > 0 ? "warn" : "neutral"}
        />
      </div>
      <AdminCard title="Signups by week">
        {isPending ? (
          <AdminSkeletonList rows={6} />
        ) : (
          <AdminBars items={(data?.signupsByWeek ?? []).map((row) => ({ label: row.week, count: row.count }))} />
        )}
      </AdminCard>
      <AdminCard title="Roles">
        {isPending ? (
          <AdminSkeletonList rows={3} />
        ) : (
          <AdminBars items={Object.entries(data?.byRole ?? {}).map(([label, count]) => ({ label, count }))} />
        )}
      </AdminCard>
    </AdminSection>
  );
}
