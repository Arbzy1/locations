import { useQuery } from "@tanstack/react-query";
import { adminJson } from "../../lib/admin-api";
import { AdminCard, AdminError, AdminSection } from "./AdminSection";
import { AdminEmpty, AdminSkeletonList, AdminStat, AdminStatus } from "./AdminUi";

type Email = {
  kinds: string[];
  lastRecap: { considered: number; sent: number; at?: string } | null;
};

export function AdminEmailPage() {
  const { data, isError, isPending } = useQuery({
    queryKey: ["admin-email"],
    queryFn: () => adminJson<Email>("/api/admin/email"),
  });
  if (isError) return <AdminError />;
  return (
    <AdminSection title="Email" description="Transactional kinds only. Recipients are never listed.">
      <AdminCard title="Last monthly recap cron">
        {isPending ? (
          <AdminSkeletonList rows={2} />
        ) : data?.lastRecap ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <AdminStat value={data.lastRecap.considered} label="Considered" />
            <AdminStat value={data.lastRecap.sent} label="Sent" tone="ok" />
          </div>
        ) : (
          <AdminEmpty>No cron result stored yet.</AdminEmpty>
        )}
        {data?.lastRecap?.at && <p className="mt-3 text-xs text-text-muted">{data.lastRecap.at}</p>}
      </AdminCard>
      <AdminCard title="Kinds">
        {isPending ? (
          <AdminSkeletonList rows={4} />
        ) : (data?.kinds ?? []).length === 0 ? (
          <AdminEmpty>No kinds listed.</AdminEmpty>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(data?.kinds ?? []).map((kind) => (
              <AdminStatus key={kind}>{kind}</AdminStatus>
            ))}
          </div>
        )}
      </AdminCard>
    </AdminSection>
  );
}
