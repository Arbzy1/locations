import { useQuery } from "@tanstack/react-query";
import { adminJson } from "../../lib/admin-api";
import { AdminCard, AdminError, AdminSection } from "./AdminSection";

type Analytics = {
  byRole: Record<string, number>;
  importsReady: number;
  importsError: number;
  recapOptIn: number;
};

export function AdminAnalyticsPage() {
  const { data, isError } = useQuery({
    queryKey: ["admin-analytics"],
    queryFn: () => adminJson<Analytics>("/api/admin/analytics"),
  });
  if (isError) return <AdminError />;
  return (
    <AdminSection title="Analytics" description="Product metrics. Not location analytics and not other people’s maps.">
      <AdminCard title="Roles">
        <ul className="space-y-1 text-sm">
          {Object.entries(data?.byRole ?? {}).map(([role, count]) => (
            <li key={role}>
              {role}: {count}
            </li>
          ))}
        </ul>
      </AdminCard>
      <AdminCard title="Imports and recap">
        <ul className="space-y-1 text-sm">
          <li>Latest job ready: {data?.importsReady ?? 0}</li>
          <li>Latest job error: {data?.importsError ?? 0}</li>
          <li>Recap opt-in: {data?.recapOptIn ?? 0}</li>
        </ul>
      </AdminCard>
    </AdminSection>
  );
}
