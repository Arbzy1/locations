import { Link, useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../../lib/auth";
import { adminJson } from "../../lib/admin-api";
import { Button } from "../ui/button";
import { AdminCard, AdminError, AdminSection } from "./AdminSection";
import { AdminLoadMore, AdminSkeletonList, AdminStat, AdminStatus, AdminTable, jobStatus } from "./AdminUi";

type Imports = {
  stuckCount: number;
  jobs: {
    userId: string;
    email: string;
    id: string;
    status: string;
    ageMinutes: number;
    parsedCount: number;
    visitCount: number;
    error: string | null;
  }[];
  cursor: string | null;
};

export function AdminImportsPage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "all";
  const queryClient = useQueryClient();
  const list = useInfiniteQuery({
    queryKey: ["admin-imports", status],
    queryFn: ({ pageParam }) => {
      const search = new URLSearchParams();
      if (status && status !== "all") search.set("status", status);
      if (pageParam) search.set("cursor", pageParam);
      const qs = search.toString();
      return adminJson<Imports>(`/api/admin/imports${qs ? `?${qs}` : ""}`);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.cursor,
  });
  const fail = useMutation({
    mutationFn: (job: { userId: string; id: string }) =>
      adminJson(`/api/admin/imports/${job.userId}/jobs/${job.id}/fail`, {
        method: "POST",
        body: JSON.stringify({ confirm: "stuck" }),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-imports"] }),
  });
  if (list.isError) return <AdminError />;
  const jobs = list.data?.pages.flatMap((page) => page.jobs) ?? [];
  const stuckCount = list.data?.pages[0]?.stuckCount ?? 0;
  return (
    <AdminSection title="Imports" description="Job ids, status, and sanitized errors. Unlocking a stuck job clears the one-active 409. The user must re-upload. No requeue.">
      <AdminStat loading={list.isPending} value={stuckCount} label="Stuck (sampled)" tone={stuckCount > 0 ? "danger" : "ok"} />
      <select
        className="h-11 rounded-lg border border-border bg-bg px-3 text-sm text-text"
        title="Filter import jobs"
        value={status}
        onChange={(e) => {
          const next = new URLSearchParams(params);
          if (e.target.value === "all") next.delete("status");
          else next.set("status", e.target.value);
          setParams(next);
        }}
      >
        <option value="all">All recent</option>
        <option value="stuck">Stuck</option>
        <option value="error">Error</option>
      </select>
      <AdminCard>
        {list.isPending ? (
          <AdminSkeletonList rows={5} />
        ) : (
          <>
            <AdminTable
              headers={["Job", "Status", "Age", "Parsed", "Visits", "Account", "Error"]}
              empty={jobs.length === 0}
              emptyLabel="No recent jobs in this sample."
            >
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
                    <td className="px-3 py-2 tabular-nums">{job.parsedCount}</td>
                    <td className="px-3 py-2 tabular-nums">{job.visitCount}</td>
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
                            title="Fail this stuck import so the user can upload again"
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
