import { Link } from "react-router-dom";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../../lib/auth";
import { adminJson } from "../../lib/admin/admin-api";
import { Button } from "../ui/button";
import { AdminCard, AdminError, AdminSection } from "./AdminSection";
import { AdminBars, AdminLoadMore, AdminSkeletonList, AdminStatus, AdminTable, jobStatus } from "./AdminUi";

type Exports = {
  byStatus: Record<string, number>;
  jobs: {
    userId: string;
    email: string;
    id: string;
    status: string;
    error: string | null;
    ageMinutes: number;
  }[];
  cursor: string | null;
};

export function AdminExportsPage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";
  const queryClient = useQueryClient();
  const list = useInfiniteQuery({
    queryKey: ["admin-exports"],
    queryFn: ({ pageParam }) =>
      adminJson<Exports>(`/api/admin/exports${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ""}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.cursor,
  });
  const fail = useMutation({
    mutationFn: (job: { userId: string; id: string }) =>
      adminJson(`/api/admin/exports/${job.userId}/jobs/${job.id}/fail`, {
        method: "POST",
        body: JSON.stringify({ confirm: "stuck" }),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-exports"] }),
  });
  if (list.isError) return <AdminError />;
  const jobs = list.data?.pages.flatMap((page) => page.jobs) ?? [];
  const byStatus = list.data?.pages[0]?.byStatus ?? {};
  return (
    <AdminSection title="Exports" description="GDPR pack jobs across accounts. No ZIP download of someone else’s pack.">
      <AdminCard title="Status">
        {list.isPending ? (
          <AdminSkeletonList rows={3} />
        ) : (
          <AdminBars items={Object.entries(byStatus).map(([label, count]) => ({ label, count }))} />
        )}
      </AdminCard>
      <AdminCard>
        {list.isPending ? (
          <AdminSkeletonList rows={4} />
        ) : (
          <>
            <AdminTable headers={["Job", "Status", "Age", "Account", "Error"]} empty={jobs.length === 0} emptyLabel="No export jobs in this sample.">
              {jobs.map((job) => {
                const st = jobStatus(job.status);
                const stuck = (job.status === "pending" || job.status === "processing") && job.ageMinutes >= 15;
                return (
                  <tr key={`${job.userId}-${job.id}`} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 font-mono text-xs">{job.id}</td>
                    <td className="px-3 py-2">
                      <AdminStatus tone={st.tone}>{st.label}</AdminStatus>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-text-muted">{job.ageMinutes} min</td>
                    <td className="px-3 py-2">
                      <Link to={`/admin/users/${job.userId}`} className="text-admin hover:underline" title="Open account card">
                        {job.email}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-1">
                        {job.error && <span className="text-xs text-train">{job.error}</span>}
                        {isAdmin && stuck && (
                          <Button
                            type="button"
                            variant="outline"
                            title="Fail this stuck export"
                            disabled={fail.isPending}
                            onClick={() => fail.mutate({ userId: job.userId, id: job.id })}
                          >
                            Unlock
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </AdminTable>
            <AdminLoadMore hidden={!list.hasNextPage} disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()} />
            {fail.isError && <p className="mt-2 text-sm text-train">{(fail.error as Error).message}</p>}
          </>
        )}
      </AdminCard>
    </AdminSection>
  );
}
