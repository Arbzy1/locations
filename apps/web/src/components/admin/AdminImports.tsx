import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { adminJson } from "../../lib/admin-api";
import { AdminCard, AdminError, AdminSection } from "./AdminSection";
import { AdminSkeletonList, AdminStat, AdminStatus, AdminTable, jobStatus } from "./AdminUi";

type Imports = {
  stuckCount: number;
  jobs: { userId: string; id: string; status: string; ageMinutes: number; parsedCount: number; visitCount: number }[];
};

export function AdminImportsPage() {
  const { data, isError, isPending } = useQuery({
    queryKey: ["admin-imports"],
    queryFn: () => adminJson<Imports>("/api/admin/imports"),
  });
  if (isError) return <AdminError />;
  const jobs = data?.jobs ?? [];
  return (
    <AdminSection title="Imports" description="Job ids, status, and counts. No coordinates or R2 keys.">
      <AdminStat
        loading={isPending}
        value={data?.stuckCount ?? 0}
        label="Stuck (sampled)"
        tone={(data?.stuckCount ?? 0) > 0 ? "danger" : "ok"}
      />
      <AdminCard>
        {isPending ? (
          <AdminSkeletonList rows={5} />
        ) : (
          <AdminTable
            headers={["Job", "Status", "Age", "Parsed", "Visits", "Account"]}
            empty={jobs.length === 0}
            emptyLabel="No recent jobs in this sample."
          >
            {jobs.map((job) => {
              const status = jobStatus(job.status);
              return (
                <tr key={`${job.userId}-${job.id}`} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">{job.id}</td>
                  <td className="px-3 py-2">
                    <AdminStatus tone={status.tone}>{status.label}</AdminStatus>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-text-muted">{job.ageMinutes} min</td>
                  <td className="px-3 py-2 tabular-nums">{job.parsedCount}</td>
                  <td className="px-3 py-2 tabular-nums">{job.visitCount}</td>
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
