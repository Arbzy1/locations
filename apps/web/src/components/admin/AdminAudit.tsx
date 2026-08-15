import { Link, useSearchParams } from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import { adminJson } from "../../lib/admin/admin-api";
import { Button } from "../ui/button";
import { EjectField } from "../ui/eject-field";
import { AdminCard, AdminError, AdminSection } from "./AdminSection";
import { AdminLoadMore, AdminSkeletonList, AdminTable } from "./AdminUi";

type AuditEntry = {
  id: string;
  actorUserId: string;
  action: string;
  targetUserId: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
};

type Audit = {
  entries: AuditEntry[];
  cursor: string | null;
};

const ACTIONS = ["", "flags", "flags_reset", "invite", "send_reset", "import_fail", "export_fail", "email_test", "role", "verify", "revoke_sessions", "wipe"];

function formatWhen(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatMeta(meta: Record<string, unknown>) {
  const parts = Object.entries(meta).map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`);
  return parts.length ? parts.join(" ") : "None";
}

function csvCell(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

function downloadCsv(entries: AuditEntry[]) {
  const header = ["when", "action", "actorId", "targetId"];
  const lines = [
    header.join(","),
    ...entries.map((row) =>
      [row.createdAt, row.action, row.actorUserId, row.targetUserId ?? ""].map(csvCell).join(","),
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "ops-audit.csv";
  a.title = "Download loaded audit rows as CSV";
  a.click();
  URL.revokeObjectURL(url);
}

export function AdminAuditPage() {
  const [params, setParams] = useSearchParams();
  const action = params.get("action") ?? "";
  const list = useInfiniteQuery({
    queryKey: ["admin-audit", action],
    queryFn: ({ pageParam }) => {
      const search = new URLSearchParams();
      if (action) search.set("action", action);
      if (pageParam) search.set("cursor", pageParam);
      const qs = search.toString();
      return adminJson<Audit>(`/api/admin/audit${qs ? `?${qs}` : ""}`);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.cursor,
  });
  if (list.isError) return <AdminError />;
  const entries = list.data?.pages.flatMap((page) => page.entries) ?? [];
  return (
    <AdminSection title="Audit" description="Staff actions. Meta is ids, counts, and flag keys only. CSV is the loaded page, not a new API.">
      <div className="flex flex-wrap items-center gap-2">
        <EjectField label="Filter audit actions" htmlFor="admin-audit-action">
          <select
            id="admin-audit-action"
            className="h-11 w-full rounded-lg border border-border bg-bg px-3 text-sm text-text"
            title="Filter audit actions"
            value={action}
            onChange={(e) => {
              const next = new URLSearchParams(params);
              if (e.target.value) next.set("action", e.target.value);
              else next.delete("action");
              setParams(next);
            }}
          >
            {ACTIONS.map((value) => (
              <option key={value || "all"} value={value}>
                {value || "All actions"}
              </option>
            ))}
          </select>
        </EjectField>
        <Button
          type="button"
          variant="outline"
          title="Download loaded audit rows as CSV"
          disabled={entries.length === 0}
          onClick={() => downloadCsv(entries)}
        >
          Download CSV
        </Button>
      </div>
      <AdminCard>
        {list.isPending ? (
          <AdminSkeletonList rows={5} />
        ) : (
          <>
            <AdminTable
              headers={["When", "Action", "Actor", "Target", "Meta"]}
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
                  <td className="px-3 py-2 font-mono text-xs text-text-muted">{formatMeta(row.meta)}</td>
                </tr>
              ))}
            </AdminTable>
            <AdminLoadMore hidden={!list.hasNextPage} disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()} />
          </>
        )}
      </AdminCard>
    </AdminSection>
  );
}
