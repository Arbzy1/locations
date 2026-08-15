import { Link } from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import { adminJson } from "../../lib/admin/admin-api";
import { AdminCard, AdminError, AdminSection } from "./AdminSection";
import { AdminBars, AdminLoadMore, AdminSkeletonList, AdminStatus, AdminTable, billingStatus } from "./AdminUi";

type Billing = {
  histogram: Record<string, number>;
  pastDue: {
    userId: string;
    email: string;
    status: string;
    graceUntil: string | null;
    currentPeriodEnd: string | null;
    interval: "monthly" | "yearly" | "other" | null;
  }[];
  cursor: string | null;
};

function formatWhen(value: string | null) {
  if (!value) return "None";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function AdminBillingPage() {
  const { data, isError, isPending, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteQuery({
    queryKey: ["admin-billing"],
    queryFn: ({ pageParam }) =>
      adminJson<Billing>(`/api/admin/billing${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ""}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.cursor,
  });
  if (isError) return <AdminError />;
  const histogram = data?.pages[0]?.histogram ?? {};
  const pastDue = data?.pages.flatMap((page) => page.pastDue) ?? [];
  return (
    <AdminSection title="Billing" description="Status histogram across accounts. No Stripe secrets or customer ids.">
      <AdminCard title="Status">
        {isPending ? (
          <AdminSkeletonList rows={4} />
        ) : (
          <AdminBars items={Object.entries(histogram).map(([label, count]) => ({ label, count }))} />
        )}
      </AdminCard>
      <AdminCard title="Past due">
        {isPending ? (
          <AdminSkeletonList rows={3} />
        ) : (
          <>
            <AdminTable
              headers={["Email", "Status", "Interval", "Grace until", "Period end"]}
              empty={pastDue.length === 0}
              emptyLabel="None in this sample."
            >
              {pastDue.map((row) => {
                const status = billingStatus(row.status);
                return (
                  <tr key={row.userId} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">
                      <Link to={`/admin/users/${row.userId}`} className="text-admin hover:underline" title="Open account card">
                        {row.email}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <AdminStatus tone={status.tone}>{status.label}</AdminStatus>
                    </td>
                    <td className="px-3 py-2 text-text-muted">{row.interval ?? "None"}</td>
                    <td className="px-3 py-2 text-text-muted">{formatWhen(row.graceUntil)}</td>
                    <td className="px-3 py-2 text-text-muted">{formatWhen(row.currentPeriodEnd)}</td>
                  </tr>
                );
              })}
            </AdminTable>
            <AdminLoadMore hidden={!hasNextPage} disabled={isFetchingNextPage} onClick={() => void fetchNextPage()} />
          </>
        )}
      </AdminCard>
    </AdminSection>
  );
}
