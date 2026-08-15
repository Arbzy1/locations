import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../../lib/auth";
import { adminJson } from "../../lib/admin-api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Dialog, DialogContent } from "../ui/dialog";
import { AdminCard, AdminError, AdminSection } from "./AdminSection";
import {
  AdminDl,
  AdminEmpty,
  AdminLoadMore,
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
  lastSessionAt?: string | null;
};

type UserCard = UserRow & {
  visitCount: number;
  sourceCount: number;
  sessionCount: number;
  lastSessionAt: string | null;
  billingStatus: string;
  graceUntil: string | null;
  currentPeriodEnd: string | null;
  interval: "monthly" | "yearly" | "other" | null;
  entitled: boolean;
  readOnlyGrace: boolean;
  quota: { maxSources: number; sourceCount: number; maxUploadBytes: number };
  recapOptIn: boolean;
  latestImport: { id: string; status: string; error: string | null; ageMinutes: number } | null;
  latestExport: { id: string; status: string; error: string | null } | null;
};

function formatWhen(value: string | null | undefined) {
  if (!value) return "None";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function copyText(value: string) {
  void navigator.clipboard.writeText(value);
}

export function AdminUsersPage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const role = params.get("role") ?? "";
  const verified = params.get("verified") ?? "";
  const billing = params.get("billing") ?? "";
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("user");
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const list = useInfiniteQuery({
    queryKey: ["admin-users", q, role, verified, billing],
    queryFn: ({ pageParam }) => {
      const search = new URLSearchParams({ limit: "25" });
      if (q.trim().length >= 2) search.set("q", q.trim());
      if (role) search.set("role", role);
      if (verified) search.set("verified", verified);
      if (billing) search.set("billing", billing);
      if (pageParam) search.set("cursor", pageParam);
      return adminJson<{ users: UserRow[]; cursor: string | null }>(`/api/admin/users?${search}`);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.cursor,
  });

  const invite = useMutation({
    mutationFn: () =>
      adminJson<{ ok: true; id: string; reset: string }>("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail, name: inviteName || undefined, role: inviteRole }),
      }),
    onSuccess: (data) => {
      setInviteMsg(`Invited. Password reset ${data.reset}.`);
      setInviteEmail("");
      setInviteName("");
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (err: Error) => setInviteMsg(err.message),
  });

  if (list.isError) return <AdminError />;
  const rows = list.data?.pages.flatMap((page) => page.users) ?? [];

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }

  return (
    <AdminSection title="Users" description="Email, role, and verification. Open a card for counts, not maps.">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          value={q}
          onChange={(e) => setFilter("q", e.target.value)}
          placeholder="Search email prefix"
          title="Search accounts by email prefix"
        />
        <select
          className="h-11 rounded-lg border border-border bg-bg px-3 text-sm text-text"
          title="Filter by role"
          value={role}
          onChange={(e) => setFilter("role", e.target.value)}
        >
          <option value="">All roles</option>
          <option value="user">user</option>
          <option value="admin">admin</option>
          <option value="developer">developer</option>
          <option value="demo">demo</option>
        </select>
        <select
          className="h-11 rounded-lg border border-border bg-bg px-3 text-sm text-text"
          title="Filter by verification"
          value={verified}
          onChange={(e) => setFilter("verified", e.target.value)}
        >
          <option value="">Any verification</option>
          <option value="true">Verified</option>
          <option value="false">Unverified</option>
        </select>
        <select
          className="h-11 rounded-lg border border-border bg-bg px-3 text-sm text-text"
          title="Filter by billing"
          value={billing}
          onChange={(e) => setFilter("billing", e.target.value)}
        >
          <option value="">Any billing</option>
          <option value="active">Entitled</option>
          <option value="past_due">Past due</option>
          <option value="none">None</option>
        </select>
      </div>
      {isAdmin && (
        <AdminCard title="Invite">
          <p className="text-xs text-text-muted">
            Creates a credential account and sends a password reset. The password is never shown. Cannot invite admin or demo.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Input
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="email@example.com"
              title="Invite email"
            />
            <Input value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Name (optional)" title="Invite display name" />
            <select
              className="h-11 rounded-lg border border-border bg-bg px-3 text-sm text-text"
              title="Invite role"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
            >
              <option value="user">user</option>
              <option value="developer">developer</option>
            </select>
            <Button type="button" title="Send invite" disabled={invite.isPending || !inviteEmail.includes("@")} onClick={() => invite.mutate()}>
              Invite
            </Button>
          </div>
          {inviteMsg && <p className="mt-2 text-sm text-text-muted">{inviteMsg}</p>}
        </AdminCard>
      )}
      <AdminCard>
        {list.isPending ? (
          <AdminSkeletonList rows={6} />
        ) : (
          <>
            <AdminTable headers={["Email", "Role", "Verified", "Last session", "Created"]} empty={rows.length === 0} emptyLabel="No accounts in this page.">
              {rows.map((row) => {
                const roleMeta = roleStatus(row.role);
                const verifiedMeta = boolStatus(row.emailVerified, "Verified", "Unverified", "warn");
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
                      <AdminStatus tone={roleMeta.tone}>{roleMeta.label}</AdminStatus>
                    </td>
                    <td className="px-3 py-2">
                      <AdminStatus tone={verifiedMeta.tone}>{verifiedMeta.label}</AdminStatus>
                    </td>
                    <td className="px-3 py-2 text-text-muted">{formatWhen(row.lastSessionAt)}</td>
                    <td className="px-3 py-2 text-text-muted">{formatWhen(row.createdAt)}</td>
                  </tr>
                );
              })}
            </AdminTable>
            <AdminLoadMore
              hidden={!list.hasNextPage}
              disabled={list.isFetchingNextPage}
              onClick={() => void list.fetchNextPage()}
            />
          </>
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
    mutationFn: (emailVerified: boolean) =>
      adminJson(`/api/admin/users/${id}/verify`, {
        method: "POST",
        body: JSON.stringify({ emailVerified }),
      }),
    onSuccess: () => {
      setMessage("Verification updated.");
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
  const resetMut = useMutation({
    mutationFn: () => adminJson<{ reset: string }>(`/api/admin/users/${id}/send-reset`, { method: "POST", body: "{}" }),
    onSuccess: (body) => {
      setMessage(`Password reset ${body.reset}.`);
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
  const entitled = boolStatus(data.entitled, "Entitled", "Not entitled", "warn");
  const grace = boolStatus(data.readOnlyGrace, "Read-only grace", "No grace");

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
        <AdminStat value={`${data.quota.sourceCount} / ${data.quota.maxSources}`} label="Sources vs quota" />
        <AdminStat value={data.sessionCount} label="Sessions" />
        <AdminStat value={billing.label} label="Billing" tone={billing.tone} />
      </div>
      <AdminCard title="Account">
        <AdminDl
          rows={[
            {
              label: "Id",
              value: (
                <span className="flex items-center gap-2">
                  <span className="font-mono text-xs">{data.id}</span>
                  <Button type="button" variant="outline" title="Copy user id" onClick={() => copyText(data.id)}>
                    Copy
                  </Button>
                </span>
              ),
            },
            {
              label: "Email",
              value: (
                <span className="flex items-center gap-2">
                  <span>{data.email}</span>
                  <Button type="button" variant="outline" title="Copy email" onClick={() => copyText(data.email)}>
                    Copy
                  </Button>
                </span>
              ),
            },
            { label: "Name", value: data.name || "None" },
            { label: "Role", value: <AdminStatus tone={roleMeta.tone}>{roleMeta.label}</AdminStatus> },
            { label: "Verified", value: <AdminStatus tone={verified.tone}>{verified.label}</AdminStatus> },
            { label: "Created", value: formatWhen(data.createdAt) },
            { label: "Last session", value: formatWhen(data.lastSessionAt) },
            { label: "Recap", value: <AdminStatus tone={recap.tone}>{recap.label}</AdminStatus> },
            { label: "Entitled", value: <AdminStatus tone={entitled.tone}>{entitled.label}</AdminStatus> },
            { label: "Grace", value: <AdminStatus tone={grace.tone}>{grace.label}</AdminStatus> },
            { label: "Grace until", value: formatWhen(data.graceUntil) },
            { label: "Period end", value: formatWhen(data.currentPeriodEnd) },
            { label: "Plan interval", value: data.interval ?? "None" },
            { label: "Upload cap", value: `${Math.round(data.quota.maxUploadBytes / (1024 * 1024))} MB` },
            {
              label: "Latest import",
              value: data.latestImport ? (
                <span className="flex flex-col gap-1">
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-xs">{data.latestImport.id}</span>
                    {latestImport && <AdminStatus tone={latestImport.tone}>{latestImport.label}</AdminStatus>}
                    <span className="text-xs text-text-muted">{data.latestImport.ageMinutes} min</span>
                  </span>
                  {data.latestImport.error && <span className="text-xs text-train">{data.latestImport.error}</span>}
                </span>
              ) : (
                "None"
              ),
            },
            {
              label: "Latest export",
              value: data.latestExport ? (
                <span className="flex flex-col gap-1">
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-xs">{data.latestExport.id}</span>
                    {latestExport && <AdminStatus tone={latestExport.tone}>{latestExport.label}</AdminStatus>}
                  </span>
                  {data.latestExport.error && <span className="text-xs text-train">{data.latestExport.error}</span>}
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
              onClick={() => verifyMut.mutate(true)}
              disabled={verifyMut.isPending || data.emailVerified}
            >
              Mark verified
            </Button>
            <Button
              type="button"
              variant="outline"
              title="Mark email unverified"
              onClick={() => verifyMut.mutate(false)}
              disabled={verifyMut.isPending || !data.emailVerified}
            >
              Unverify
            </Button>
            <Button
              type="button"
              variant="outline"
              title="Send password reset email"
              onClick={() => resetMut.mutate()}
              disabled={resetMut.isPending || data.role === "demo"}
            >
              Send password reset
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
