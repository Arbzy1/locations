import { Link } from "react-router-dom";
import { useAdminStats } from "../../hooks/useApi";
import { Button } from "../ui/button";
import { AdminCard, AdminError, AdminSection } from "./AdminSection";

export function AdminMePage() {
  const { data, isError } = useAdminStats();
  if (isError) return <AdminError />;
  const stuck = data?.stuckJobs ?? [];
  const recent = data?.recentJobs ?? [];
  return (
    <AdminSection
      title="My tenant"
      description="Your own visit and source counts. Other accounts stay behind row-level security."
    >
      <AdminCard>
        <ul className="space-y-1 text-sm">
          <li>Visits: {data?.visitCount ?? 0}</li>
          <li>Sources: {data?.sourceCount ?? 0}</li>
          <li>Latest job: {data?.latestJobStatus ?? "none"}</li>
          <li>Recent jobs listed: {data?.recentJobCount ?? 0}</li>
          <li>Stuck imports (pending or processing over 15 minutes): {data?.stuckJobCount ?? 0}</li>
        </ul>
      </AdminCard>
      {stuck.length > 0 && (
        <AdminCard title="Stuck jobs">
          <ul className="space-y-2 text-sm">
            {stuck.map((j) => (
              <li key={j.id} className="rounded-lg border border-border bg-bg px-3 py-2">
                <div className="font-mono text-xs">{j.id}</div>
                <div className="text-text-muted">
                  {j.status} · {j.ageMinutes} min · {j.parsedCount} parsed · {j.visitCount} visits
                </div>
              </li>
            ))}
          </ul>
        </AdminCard>
      )}
      {recent.length > 0 && (
        <AdminCard title="Recent jobs">
          <ul className="space-y-2 text-sm">
            {recent.map((j) => (
              <li key={j.id} className="rounded-lg border border-border bg-bg px-3 py-2">
                <div className="font-mono text-xs">{j.id}</div>
                <div className="text-text-muted">
                  {j.status} · {j.ageMinutes} min · {j.parsedCount} parsed · {j.visitCount} visits
                </div>
              </li>
            ))}
          </ul>
        </AdminCard>
      )}
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
