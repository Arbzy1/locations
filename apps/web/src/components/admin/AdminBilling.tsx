import { useQuery } from "@tanstack/react-query";
import { adminJson } from "../../lib/admin-api";
import { AdminCard, AdminError, AdminSection } from "./AdminSection";

type Billing = {
  histogram: Record<string, number>;
  pastDue: { userId: string; status: string }[];
};

export function AdminBillingPage() {
  const { data, isError } = useQuery({
    queryKey: ["admin-billing"],
    queryFn: () => adminJson<Billing>("/api/admin/billing"),
  });
  if (isError) return <AdminError />;
  return (
    <AdminSection title="Billing" description="Status histogram across accounts. No Stripe secrets.">
      <AdminCard title="Status">
        <ul className="space-y-1 text-sm">
          {Object.entries(data?.histogram ?? {}).map(([status, count]) => (
            <li key={status}>
              {status}: {count}
            </li>
          ))}
          {Object.keys(data?.histogram ?? {}).length === 0 && <li>No sampled subscriptions.</li>}
        </ul>
      </AdminCard>
      <AdminCard title="Past due">
        <ul className="space-y-1 text-sm">
          {(data?.pastDue ?? []).map((row) => (
            <li key={row.userId}>
              {row.userId} · {row.status}
            </li>
          ))}
          {(data?.pastDue ?? []).length === 0 && <li>None in this sample.</li>}
        </ul>
      </AdminCard>
    </AdminSection>
  );
}
