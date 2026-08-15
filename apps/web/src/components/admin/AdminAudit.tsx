import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { adminJson } from "../../lib/admin-api";
import { AdminCard, AdminError, AdminSection } from "./AdminSection";
import { AdminSkeletonList, AdminTable } from "./AdminUi";

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

function formatWhen(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function AdminAuditPage() {
  const { data, isError, isPending } = useQuery({
    queryKey: ["admin-audit"],
    queryFn: () => adminJson<Audit>("/api/admin/audit"),
  });
  if (isError) return <AdminError />;
  const entries = data?.entries ?? [];
  return (
    <AdminSection title="Audit" description="Staff actions. Meta is ids, counts, and flag keys only.">
      <AdminCard>
        {isPending ? (
          <AdminSkeletonList rows={5} />
        ) : (
          <AdminTable
            headers={["When", "Action", "Actor", "Target"]}
            empty={entries.length === 0}
            emptyLabel="No staff actions yet."
          >
            {entries.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2 text-xs text-text-muted">{formatWhen(row.createdAt)}</td>
                <td className="px-3 py-2">{row.action}</td>
                <td className="px-3 py-2">
                  <Link to={`/admin/users/${row.actorUserId}`} className="font-mono text-xs text-admin hover:underline" title="Open actor account">
                    {row.actorUserId}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  {row.targetUserId ? (
                    <Link to={`/admin/users/${row.targetUserId}`} className="font-mono text-xs text-admin hover:underline" title="Open target account">
                      {row.targetUserId}
                    </Link>
                  ) : (
                    <span className="text-text-muted">None</span>
                  )}
                </td>
              </tr>
            ))}
          </AdminTable>
        )}
      </AdminCard>
    </AdminSection>
  );
}
