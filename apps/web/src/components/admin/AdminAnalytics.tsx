import { useQuery } from "@tanstack/react-query";
import { adminJson } from "../../lib/admin-api";
import { AdminCard, AdminError, AdminSection } from "./AdminSection";
import { AdminBars, AdminSkeletonList, AdminStat } from "./AdminUi";

type Analytics = {
  byRole: Record<string, number>;
  importsReady: number;
  importsError: number;
  recapOptIn: number;
};

export function AdminAnalyticsPage() {
  const { data, isError, isPending } = useQuery({
    queryKey: ["admin-analytics"],
    queryFn: () => adminJson<Analytics>("/api/admin/analytics"),
  });
  if (isError) return <AdminError />;
  return (
    <AdminSection title="Analytics" description="Product metrics. Not location analytics and not other people’s maps.">
      <div className="grid gap-3 sm:grid-cols-3">
        <AdminStat loading={isPending} value={data?.importsReady ?? 0} label="Latest job ready" tone="ok" />
        <AdminStat
          loading={isPending}
          value={data?.importsError ?? 0}
          label="Latest job error"
          tone={(data?.importsError ?? 0) > 0 ? "danger" : "neutral"}
        />
        <AdminStat loading={isPending} value={data?.recapOptIn ?? 0} label="Recap opt-in" />
      </div>
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
