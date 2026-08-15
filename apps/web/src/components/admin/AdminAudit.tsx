import { useQuery } from "@tanstack/react-query";
import { adminJson } from "../../lib/admin-api";
import { AdminCard, AdminError, AdminSection } from "./AdminSection";

type Audit = {
  entries: {
    id: string;
    actorUserId: string;
    action: string;
    targetUserId: string | null;
    meta: Record<string, unknown>;
    createdAt: string;
  }[];
};

export function AdminAuditPage() {
  const { data, isError } = useQuery({
    queryKey: ["admin-audit"],
    queryFn: () => adminJson<Audit>("/api/admin/audit"),
  });
  if (isError) return <AdminError />;
  return (
    <AdminSection title="Audit" description="Staff actions. Meta is ids, counts, and flag keys only.">
      <AdminCard>
        <ul className="space-y-2 text-sm">
          {(data?.entries ?? []).map((row) => (
            <li key={row.id} className="rounded-lg border border-border bg-bg px-3 py-2">
              <div>
                {row.action} · actor {row.actorUserId}
                {row.targetUserId ? ` · target ${row.targetUserId}` : ""}
              </div>
              <div className="text-xs text-text-muted">{row.createdAt}</div>
            </li>
          ))}
          {(data?.entries ?? []).length === 0 && <li>No staff actions yet.</li>}
        </ul>
      </AdminCard>
    </AdminSection>
  );
}
