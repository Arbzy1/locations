import { Link } from "react-router-dom";
import { useAdminStats } from "../../hooks/useApi";
import { Button } from "../ui/button";
import { AdminCard, AdminError, AdminSection } from "./AdminSection";
import { AdminSkeletonList, AdminStat, AdminStatus, AdminTable, jobStatus } from "./AdminUi";

export function AdminMePage() {
  const { data, isError, isPending } = useAdminStats();
  if (isError) return <AdminError />;
  const stuck = data?.stuckJobs ?? [];
  const recent = data?.recentJobs ?? [];
  const latest = data?.latestJobStatus ? jobStatus(data.latestJobStatus) : null;
  return (
    <AdminSection
      title="My tenant"
      description="Your own visit and source counts. Other accounts stay behind row-level security."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStat loading={isPending} value={data?.visitCount ?? 0} label="Visits" />
        <AdminStat loading={isPending} value={data?.sourceCount ?? 0} label="Sources" />
        <AdminStat loading={isPending} value={data?.recentJobCount ?? 0} label="Recent jobs" />
        <AdminStat
          loading={isPending}
          value={data?.stuckJobCount ?? 0}
          label="Stuck imports"
          hint="Pending or processing over 15 minutes"
          tone={(data?.stuckJobCount ?? 0) > 0 ? "danger" : "ok"}
        />
      </div>
      <AdminCard title="Latest job">
        {isPending ? (
          <AdminSkeletonList rows={1} />
        ) : latest ? (
          <AdminStatus tone={latest.tone}>{latest.label}</AdminStatus>
        ) : (
          <p className="text-sm text-text-muted">No jobs yet.</p>
        )}
      </AdminCard>
      <AdminCard title="Stuck jobs">
        {isPending ? (
          <AdminSkeletonList rows={2} />
        ) : (
          <AdminTable
            headers={["Job", "Status", "Age", "Parsed", "Visits"]}
            empty={stuck.length === 0}
            emptyLabel="No stuck imports on your tenant."
          >
            {stuck.map((job) => {
              const status = jobStatus(job.status);
              return (
                <tr key={job.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">{job.id}</td>
                  <td className="px-3 py-2">
                    <AdminStatus tone={status.tone}>{status.label}</AdminStatus>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-text-muted">{job.ageMinutes} min</td>
                  <td className="px-3 py-2 tabular-nums">{job.parsedCount}</td>
                  <td className="px-3 py-2 tabular-nums">{job.visitCount}</td>
                </tr>
              );
            })}
          </AdminTable>
        )}
      </AdminCard>
      <AdminCard title="Recent jobs">
        {isPending ? (
          <AdminSkeletonList rows={2} />
        ) : (
          <AdminTable
            headers={["Job", "Status", "Age", "Parsed", "Visits"]}
            empty={recent.length === 0}
            emptyLabel="No recent jobs on your tenant."
          >
            {recent.map((job) => {
              const status = jobStatus(job.status);
              return (
                <tr key={job.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">{job.id}</td>
                  <td className="px-3 py-2">
                    <AdminStatus tone={status.tone}>{status.label}</AdminStatus>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-text-muted">{job.ageMinutes} min</td>
                  <td className="px-3 py-2 tabular-nums">{job.parsedCount}</td>
                  <td className="px-3 py-2 tabular-nums">{job.visitCount}</td>
                </tr>
              );
            })}
          </AdminTable>
        )}
      </AdminCard>
      <AdminCard title="Wipe this tenant">
        <p className="text-sm text-text-muted">
          Staff still use their own tenant. To wipe: Settings, Danger zone, Delete account. That removes Neon rows, the
          R2 prefix, sessions, and the Stripe customer. Coordinates are never written to logs or email.
        </p>
        <Button asChild className="mt-3" variant="outline" title="Open Settings danger zone">
          <Link to="/settings">Open Settings</Link>
        </Button>
      </AdminCard>
    </AdminSection>
  );
}
