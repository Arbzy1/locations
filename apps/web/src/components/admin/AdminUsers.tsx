import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../../lib/auth";
import { adminJson } from "../../lib/admin-api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Dialog, DialogContent } from "../ui/dialog";
import { AdminCard, AdminError, AdminSection } from "./AdminSection";

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

export function AdminUsersPage() {
  const [q, setQ] = useState("");
  const { data, isError } = useQuery({
    queryKey: ["admin-users", q],
    queryFn: () =>
      adminJson<{ users: UserRow[]; cursor: string | null }>(
        `/api/admin/users?limit=50${q.trim().length >= 2 ? `&q=${encodeURIComponent(q.trim())}` : ""}`,
      ),
  });
  if (isError) return <AdminError />;
  return (
    <AdminSection title="Users" description="Email, role, and verification. Open a card for counts, not maps.">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search email prefix"
        title="Search accounts by email prefix"
      />
      <AdminCard>
        <ul className="divide-y divide-border">
          {(data?.users ?? []).map((row) => (
            <li key={row.id}>
              <Button asChild variant="ghost" className="h-11 w-full justify-between gap-2" title={`Open ${row.email}`}>
                <Link to={`/admin/users/${row.id}`}>
                  <span className="truncate text-sm">{row.email}</span>
                  <Badge>{row.role}</Badge>
                </Link>
              </Button>
            </li>
          ))}
        </ul>
        {(data?.users ?? []).length === 0 && <p className="text-sm text-text-muted">No accounts in this page.</p>}
      </AdminCard>
    </AdminSection>
  );
}

export function AdminUserDetailPage() {
  const { id = "" } = useParams();
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";
  const queryClient = useQueryClient();
  const { data, isError } = useQuery({
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
  if (!data) return <AdminSection title="User"><p className="text-sm text-text-muted">Loading…</p></AdminSection>;

  return (
    <AdminSection title={data.email} description="Counts and billing only. Timeline maps stay on that user’s own session.">
      <AdminCard title="Account">
        <ul className="space-y-1 text-sm">
          <li>Id: {data.id}</li>
          <li>Name: {data.name}</li>
          <li>Role: {data.role}</li>
          <li>Verified: {String(data.emailVerified)}</li>
          <li>Created: {data.createdAt}</li>
          <li>Visits: {data.visitCount}</li>
          <li>Sources: {data.sourceCount}</li>
          <li>Sessions: {data.sessionCount}</li>
          <li>Billing: {data.billingStatus}</li>
          <li>Recap opt-in: {String(data.recapOptIn)}</li>
          <li>Latest import: {data.latestImport ? `${data.latestImport.id} (${data.latestImport.status})` : "none"}</li>
          <li>Latest export: {data.latestExport ? `${data.latestExport.id} (${data.latestExport.status})` : "none"}</li>
        </ul>
      </AdminCard>
      {isAdmin && (
        <AdminCard title="Actions">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
            <Button
              type="button"
              variant="destructive"
              title="Wipe this account after email confirm"
              onClick={() => setWipeOpen(true)}
            >
              Wipe
            </Button>
          </div>
        </AdminCard>
      )}
      {message && <p className="text-sm text-text-muted">{message}</p>}
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
