import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../../lib/auth";
import { adminJson } from "../../lib/admin-api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Dialog, DialogContent } from "../ui/dialog";
import { AdminCard, AdminError, AdminSection } from "./AdminSection";
import {
  AdminDl,
  AdminEmpty,
  AdminSkeletonList,
  AdminStat,
  AdminStatus,
  AdminTable,
  billingStatus,
  boolStatus,
  jobStatus,
  roleStatus,
} from "./AdminUi";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  emailVerified: boolean;
  createdAt: string;
};

type UserCard = UserRow & {
  visitCount: number;
  sourceCount: number;
  sessionCount: number;
  billingStatus: string;
  recapOptIn: boolean;
  latestImport: { id: string; status: string } | null;
  latestExport: { id: string; status: string } | null;
};

function formatWhen(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function AdminUsersPage() {
  const [q, setQ] = useState("");
  const { data, isError, isPending } = useQuery({
    queryKey: ["admin-users", q],
    queryFn: () =>
      adminJson<{ users: UserRow[]; cursor: string | null }>(
        `/api/admin/users?limit=50${q.trim().length >= 2 ? `&q=${encodeURIComponent(q.trim())}` : ""}`,
      ),
  });
  if (isError) return <AdminError />;
  const rows = data?.users ?? [];
  return (
    <AdminSection title="Users" description="Email, role, and verification. Open a card for counts, not maps.">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search email prefix"
        title="Search accounts by email prefix"
      />
      <AdminCard>
        {isPending ? (
          <AdminSkeletonList rows={6} />
        ) : (
          <AdminTable headers={["Email", "Role", "Verified", "Created"]} empty={rows.length === 0} emptyLabel="No accounts in this page.">
            {rows.map((row) => {
              const role = roleStatus(row.role);
              const verified = boolStatus(row.emailVerified, "Verified", "Unverified", "warn");
              return (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">
                    <Button asChild variant="ghost" className="h-11 max-w-full justify-start px-2" title={`Open ${row.email}`}>
                      <Link to={`/admin/users/${row.id}`} className="truncate">
                        {row.email}
                      </Link>
                    </Button>
                  </td>
                  <td className="px-3 py-2">
                    <AdminStatus tone={role.tone}>{role.label}</AdminStatus>
                  </td>
                  <td className="px-3 py-2">
                    <AdminStatus tone={verified.tone}>{verified.label}</AdminStatus>
                  </td>
                  <td className="px-3 py-2 text-text-muted">{formatWhen(row.createdAt)}</td>
                </tr>
              );
            })}
          </AdminTable>
        )}
      </AdminCard>
    </AdminSection>
  );
}

export function AdminUserDetailPage() {
  const { id = "" } = useParams();
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";
  const queryClient = useQueryClient();
  const { data, isError, isPending } = useQuery({
    queryKey: ["admin-user", id],
    queryFn: () => adminJson<UserCard>(`/api/admin/users/${id}`),
    enabled: Boolean(id),
  });
  const [role, setRole] = useState("");
  const [wipeOpen, setWipeOpen] = useState(false);
  const [wipeEmail, setWipeEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-user", id] });
    void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
  };

  const roleMut = useMutation({
    mutationFn: () =>
      adminJson(`/api/admin/users/${id}/role`, {
        method: "POST",
        body: JSON.stringify({ role: role || data?.role }),
      }),
    onSuccess: () => {
      setMessage("Role updated.");
      invalidate();
    },
    onError: (err: Error) => setMessage(err.message),
  });
  const verifyMut = useMutation({
    mutationFn: () =>
      adminJson(`/api/admin/users/${id}/verify`, {
        method: "POST",
        body: JSON.stringify({ emailVerified: true }),
      }),
    onSuccess: () => {
      setMessage("Marked verified.");
      invalidate();
    },
    onError: (err: Error) => setMessage(err.message),
  });
  const revokeMut = useMutation({
    mutationFn: () => adminJson(`/api/admin/users/${id}/revoke-sessions`, { method: "POST", body: "{}" }),
    onSuccess: () => {
      setMessage("Sessions revoked.");
      invalidate();
    },
    onError: (err: Error) => setMessage(err.message),
  });
  const wipeMut = useMutation({
    mutationFn: () =>
      adminJson(`/api/admin/users/${id}/wipe`, {
        method: "POST",
        body: JSON.stringify({ email: wipeEmail }),
      }),
    onSuccess: () => {
      setWipeOpen(false);
      setMessage("Account wiped.");
      invalidate();
    },
    onError: (err: Error) => setMessage(err.message),
  });

  if (isError) return <AdminError />;
  if (isPending || !data) {
    return (
      <AdminSection title="User">
        <AdminSkeletonList rows={5} />
      </AdminSection>
    );
  }

  const roleMeta = roleStatus(data.role);
  const verified = boolStatus(data.emailVerified, "Verified", "Unverified", "warn");
  const billing = billingStatus(data.billingStatus);
  const recap = boolStatus(data.recapOptIn, "Opted in", "Off");
  const latestImport = data.latestImport ? jobStatus(data.latestImport.status) : null;
  const latestExport = data.latestExport ? jobStatus(data.latestExport.status) : null;

  return (
    <AdminSection title={data.email} description="Counts and billing only. Timeline maps stay on that user’s own session.">
      <p className="text-sm text-text-muted">
        <Link to="/admin/users" className="text-admin hover:underline" title="Back to users">
          Users
        </Link>
        <span> / {data.email}</span>
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStat value={data.visitCount} label="Visits" />
        <AdminStat value={data.sourceCount} label="Sources" />
        <AdminStat value={data.sessionCount} label="Sessions" />
        <AdminStat value={billing.label} label="Billing" tone={billing.tone} />
      </div>
      <AdminCard title="Account">
        <AdminDl
          rows={[
            { label: "Id", value: <span className="font-mono text-xs">{data.id}</span> },
            { label: "Name", value: data.name || "None" },
            { label: "Role", value: <AdminStatus tone={roleMeta.tone}>{roleMeta.label}</AdminStatus> },
            { label: "Verified", value: <AdminStatus tone={verified.tone}>{verified.label}</AdminStatus> },
            { label: "Created", value: formatWhen(data.createdAt) },
            { label: "Recap", value: <AdminStatus tone={recap.tone}>{recap.label}</AdminStatus> },
            {
              label: "Latest import",
              value: data.latestImport ? (
                <span className="flex items-center gap-2">
                  <span className="font-mono text-xs">{data.latestImport.id}</span>
                  {latestImport && <AdminStatus tone={latestImport.tone}>{latestImport.label}</AdminStatus>}
                </span>
              ) : (
                "None"
              ),
            },
            {
              label: "Latest export",
              value: data.latestExport ? (
                <span className="flex items-center gap-2">
                  <span className="font-mono text-xs">{data.latestExport.id}</span>
                  {latestExport && <AdminStatus tone={latestExport.tone}>{latestExport.label}</AdminStatus>}
                </span>
              ) : (
                "None"
              ),
            },
          ]}
        />
      </AdminCard>
      {isAdmin && (
        <AdminCard title="Actions">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <select
              className="h-11 rounded-lg border border-border bg-bg px-3 text-sm text-text"
              title="Set account role"
              value={role || data.role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="user">user</option>
              <option value="admin">admin</option>
              <option value="developer">developer</option>
            </select>
            <Button type="button" title="Save role" onClick={() => roleMut.mutate()} disabled={roleMut.isPending}>
              Save role
            </Button>
            <Button
              type="button"
              variant="outline"
              title="Mark email verified"
              onClick={() => verifyMut.mutate()}
              disabled={verifyMut.isPending || data.emailVerified}
            >
              Mark verified
            </Button>
            <Button
              type="button"
              variant="outline"
              title="Revoke all sessions for this account"
              onClick={() => revokeMut.mutate()}
              disabled={revokeMut.isPending}
            >
              Revoke sessions
            </Button>
          </div>
        </AdminCard>
      )}
      {isAdmin && (
        <AdminCard title="Danger zone">
          <p className="text-sm text-text-muted">
            Wipe deletes Timeline rows, uploads, export packs, sessions, and the Stripe customer. It does not open their
            map.
          </p>
          <Button
            type="button"
            variant="destructive"
            className="mt-3"
            title="Wipe this account after email confirm"
            onClick={() => setWipeOpen(true)}
          >
            Wipe
          </Button>
        </AdminCard>
      )}
      {message && <AdminEmpty>{message}</AdminEmpty>}
      <Dialog open={wipeOpen} onOpenChange={setWipeOpen}>
        <DialogContent title="Confirm account wipe">
          <h3 className="text-lg font-semibold">Wipe this account?</h3>
          <p className="mt-2 text-sm text-text-muted">
            Type the account email to confirm. This deletes Timeline rows, uploads, export packs, sessions, and the
            Stripe customer. It does not open their map.
          </p>
          <Input
            className="mt-3"
            value={wipeEmail}
            onChange={(e) => setWipeEmail(e.target.value)}
            placeholder={data.email}
            title="Type the account email to confirm wipe"
          />
          <div className="mt-4 flex gap-2">
            <Button type="button" variant="outline" title="Cancel wipe" onClick={() => setWipeOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              title="Confirm wipe"
              disabled={wipeMut.isPending}
              onClick={() => wipeMut.mutate()}
            >
              Wipe account
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminSection>
  );
}
