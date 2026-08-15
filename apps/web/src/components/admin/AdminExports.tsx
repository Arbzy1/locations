import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { adminJson } from "../../lib/admin-api";
import { AdminCard, AdminError, AdminSection } from "./AdminSection";
import { AdminBars, AdminSkeletonList, AdminStatus, AdminTable, jobStatus } from "./AdminUi";

type Exports = {
  byStatus: Record<string, number>;
  jobs: { userId: string; id: string; status: string }[];
};

export function AdminExportsPage() {
  const { data, isError, isPending } = useQuery({
    queryKey: ["admin-exports"],
    queryFn: () => adminJson<Exports>("/api/admin/exports"),
  });
  if (isError) return <AdminError />;
  const jobs = data?.jobs ?? [];
  return (
    <AdminSection title="Exports" description="GDPR pack jobs across accounts. No ZIP download of someone else’s pack.">
      <AdminCard title="Status">
        {isPending ? (
          <AdminSkeletonList rows={3} />
        ) : (
          <AdminBars items={Object.entries(data?.byStatus ?? {}).map(([label, count]) => ({ label, count }))} />
        )}
      </AdminCard>
      <AdminCard>
        {isPending ? (
          <AdminSkeletonList rows={4} />
        ) : (
          <AdminTable headers={["Job", "Status", "Account"]} empty={jobs.length === 0} emptyLabel="No export jobs in this sample.">
            {jobs.map((job) => {
              const status = jobStatus(job.status);
              return (
                <tr key={`${job.userId}-${job.id}`} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">{job.id}</td>
                  <td className="px-3 py-2">
                    <AdminStatus tone={status.tone}>{status.label}</AdminStatus>
                  </td>
                  <td className="px-3 py-2">
                    <Link to={`/admin/users/${job.userId}`} className="font-mono text-xs text-admin hover:underline" title="Open account card">
                      {job.userId}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </AdminTable>
        )}
      </AdminCard>
    </AdminSection>
  );
}
