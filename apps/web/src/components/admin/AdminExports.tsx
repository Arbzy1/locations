import { useQuery } from "@tanstack/react-query";
import { adminJson } from "../../lib/admin-api";
import { AdminCard, AdminError, AdminSection } from "./AdminSection";

type Exports = {
  byStatus: Record<string, number>;
  jobs: { userId: string; id: string; status: string }[];
};

export function AdminExportsPage() {
  const { data, isError } = useQuery({
    queryKey: ["admin-exports"],
    queryFn: () => adminJson<Exports>("/api/admin/exports"),
  });
  if (isError) return <AdminError />;
  return (
    <AdminSection title="Exports" description="GDPR pack jobs across accounts. No ZIP download of someone else’s pack.">
      <AdminCard title="Status">
        <ul className="space-y-1 text-sm">
          {Object.entries(data?.byStatus ?? {}).map(([status, count]) => (
            <li key={status}>
              {status}: {count}
            </li>
          ))}
        </ul>
      </AdminCard>
      <AdminCard>
        <ul className="space-y-2 text-sm">
          {(data?.jobs ?? []).map((job) => (
            <li key={`${job.userId}-${job.id}`} className="rounded-lg border border-border bg-bg px-3 py-2">
              <div className="font-mono text-xs">{job.id}</div>
              <div className="text-text-muted">
                {job.status} · user {job.userId}
              </div>
            </li>
          ))}
          {(data?.jobs ?? []).length === 0 && <li>No export jobs in this sample.</li>}
        </ul>
      </AdminCard>
    </AdminSection>
  );
}
