import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { adminJson } from "../../lib/admin-api";
import { AdminCard, AdminError, AdminSection } from "./AdminSection";
import { AdminBars, AdminSkeletonList, AdminStatus, AdminTable, billingStatus } from "./AdminUi";

type Billing = {
  histogram: Record<string, number>;
  pastDue: { userId: string; status: string }[];
};

export function AdminBillingPage() {
  const { data, isError, isPending } = useQuery({
    queryKey: ["admin-billing"],
    queryFn: () => adminJson<Billing>("/api/admin/billing"),
  });
  if (isError) return <AdminError />;
  const pastDue = data?.pastDue ?? [];
  return (
    <AdminSection title="Billing" description="Status histogram across accounts. No Stripe secrets.">
      <AdminCard title="Status">
        {isPending ? (
          <AdminSkeletonList rows={4} />
        ) : (
          <AdminBars items={Object.entries(data?.histogram ?? {}).map(([label, count]) => ({ label, count }))} />
        )}
      </AdminCard>
      <AdminCard title="Past due">
        {isPending ? (
          <AdminSkeletonList rows={3} />
        ) : (
          <AdminTable headers={["Account", "Status"]} empty={pastDue.length === 0} emptyLabel="None in this sample.">
            {pastDue.map((row) => {
              const status = billingStatus(row.status);
              return (
                <tr key={row.userId} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">
                    <Link to={`/admin/users/${row.userId}`} className="font-mono text-xs text-admin hover:underline" title="Open account card">
                      {row.userId}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <AdminStatus tone={status.tone}>{status.label}</AdminStatus>
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
