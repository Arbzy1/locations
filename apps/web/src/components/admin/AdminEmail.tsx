import { useQuery } from "@tanstack/react-query";
import { adminJson } from "../../lib/admin-api";
import { AdminCard, AdminError, AdminSection } from "./AdminSection";

type Email = {
  kinds: string[];
  lastRecap: { considered: number; sent: number; at?: string } | null;
};

export function AdminEmailPage() {
  const { data, isError } = useQuery({
    queryKey: ["admin-email"],
    queryFn: () => adminJson<Email>("/api/admin/email"),
  });
  if (isError) return <AdminError />;
  return (
    <AdminSection title="Email" description="Transactional kinds only. Recipients are never listed.">
      <AdminCard title="Last monthly recap cron">
        {data?.lastRecap ? (
          <p className="text-sm">
            Considered {data.lastRecap.considered}, sent {data.lastRecap.sent}
            {data.lastRecap.at ? ` (${data.lastRecap.at})` : ""}
          </p>
        ) : (
          <p className="text-sm text-text-muted">No cron result stored yet.</p>
        )}
      </AdminCard>
      <AdminCard title="Kinds">
        <ul className="space-y-1 text-sm">
          {(data?.kinds ?? []).map((kind) => (
            <li key={kind}>{kind}</li>
          ))}
        </ul>
      </AdminCard>
    </AdminSection>
  );
}
