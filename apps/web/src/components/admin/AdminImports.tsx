import { useQuery } from "@tanstack/react-query";
import { adminJson } from "../../lib/admin-api";
import { AdminCard, AdminError, AdminSection } from "./AdminSection";

type Imports = {
  stuckCount: number;
  jobs: { userId: string; id: string; status: string; ageMinutes: number; parsedCount: number; visitCount: number }[];
};

export function AdminImportsPage() {
  const { data, isError } = useQuery({
    queryKey: ["admin-imports"],
    queryFn: () => adminJson<Imports>("/api/admin/imports"),
  });
  if (isError) return <AdminError />;
  return (
    <AdminSection title="Imports" description="Job ids, status, and counts. No coordinates or R2 keys.">
      <p className="text-sm">Stuck (sampled): {data?.stuckCount ?? 0}</p>
      <AdminCard>
        <ul className="space-y-2 text-sm">
          {(data?.jobs ?? []).map((job) => (
            <li key={`${job.userId}-${job.id}`} className="rounded-lg border border-border bg-bg px-3 py-2">
              <div className="font-mono text-xs">{job.id}</div>
              <div className="text-text-muted">
                {job.status} · {job.ageMinutes} min · {job.parsedCount} parsed · {job.visitCount} visits · user {job.userId}
              </div>
            </li>
          ))}
          {(data?.jobs ?? []).length === 0 && <li>No recent jobs in this sample.</li>}
        </ul>
      </AdminCard>
    </AdminSection>
  );
}
