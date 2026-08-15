import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../../lib/auth";
import { adminJson } from "../../lib/admin-api";
import { Switch } from "../ui/switch";
import { Button } from "../ui/button";
import { AlertDialog, AlertDialogContent } from "../ui/alert-dialog";
import { AdminCard, AdminError, AdminSection } from "./AdminSection";
import { AdminSkeletonList, AdminStatus, AdminTable, sourceStatus } from "./AdminUi";

type FlagKey = "signup_disabled" | "landing_enabled" | "globe_enabled" | "demo_tour";

type FlagsResponse = {
  flags: {
    signupDisabled: boolean;
    landingEnabled: boolean;
    globeEnabled: boolean;
    demoTour: boolean;
  };
  overlay: Record<FlagKey, string | null>;
  source: Record<FlagKey, "db" | "env">;
  meta: Record<FlagKey, { updatedBy: string | null; updatedAt: string | null }>;
};

const ROWS: {
  key: FlagKey;
  flag: keyof FlagsResponse["flags"];
  label: string;
  title: string;
  effect: string;
}[] = [
  {
    key: "signup_disabled",
    flag: "signupDisabled",
    label: "Disable signup",
    title: "Block public signup",
    effect: "Public /signup closes. Invite from Users, or npm run auth:create-user.",
  },
  {
    key: "landing_enabled",
    flag: "landingEnabled",
    label: "Landing page",
    title: "Show the public landing page",
    effect: "Marketing landing at / when on.",
  },
  {
    key: "globe_enabled",
    flag: "globeEnabled",
    label: "Globe",
    title: "Show the coverage globe",
    effect: "/globe in Explore when on.",
  },
  {
    key: "demo_tour",
    flag: "demoTour",
    label: "Demo tour",
    title: "Show the skippable demo tour",
    effect: "Skippable tour for the demo role.",
  },
];

type Audit = {
  entries: { id: string; actorUserId: string; action: string; createdAt: string; meta: Record<string, unknown> }[];
};

export function AdminFlagsPage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";
  const queryClient = useQueryClient();
  const [pendingSignup, setPendingSignup] = useState<boolean | null>(null);
  const { data, isError, isPending } = useQuery({
    queryKey: ["admin-flags"],
    queryFn: () => adminJson<FlagsResponse>("/api/admin/flags"),
  });
  const history = useQuery({
    queryKey: ["admin-audit-flags"],
    queryFn: () => adminJson<Audit>("/api/admin/audit?action=flags"),
  });
  const resetHistory = useQuery({
    queryKey: ["admin-audit-flags-reset"],
    queryFn: () => adminJson<Audit>("/api/admin/audit?action=flags_reset"),
  });
  const mutation = useMutation({
    mutationFn: (patch: Partial<Record<FlagKey, boolean>>) =>
      adminJson<FlagsResponse>("/api/admin/flags", { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-flags"] });
      void queryClient.invalidateQueries({ queryKey: ["public-config"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-audit-flags"] });
    },
  });
  const resetMut = useMutation({
    mutationFn: (key: FlagKey) =>
      adminJson<FlagsResponse>("/api/admin/flags/reset", { method: "POST", body: JSON.stringify({ key }) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-flags"] });
      void queryClient.invalidateQueries({ queryKey: ["public-config"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-audit-flags-reset"] });
    },
  });
  if (isError) return <AdminError />;
  const auditRows = [...(history.data?.entries ?? []), ...(resetHistory.data?.entries ?? [])]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8);

  function onToggle(key: FlagKey, next: boolean) {
    if (key === "signup_disabled" && next) {
      setPendingSignup(true);
      return;
    }
    mutation.mutate({ [key]: next });
  }

  return (
    <AdminSection
      title="Flags"
      description="Database overlay on wrangler env. Developers can read; only admins can toggle."
    >
      <AdminCard>
        {isPending ? (
          <AdminSkeletonList rows={4} />
        ) : (
          <ul className="space-y-4">
            {ROWS.map((row) => {
              const on = Boolean(data?.flags[row.flag]);
              const source = sourceStatus(data?.source[row.key] ?? "env");
              const meta = data?.meta[row.key];
              return (
                <li key={row.key} className="flex min-h-11 flex-col gap-2 border-b border-border pb-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm text-text">{row.label}</div>
                    <p className="mt-0.5 text-xs text-text-muted">{row.effect}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <AdminStatus tone={source.tone}>{source.label}</AdminStatus>
                      {meta?.updatedAt && (
                        <span className="font-mono text-[11px] text-text-muted">
                          {meta.updatedBy ?? "unknown"} · {new Date(meta.updatedAt).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {source.label === "Database" && isAdmin && (
                      <Button
                        type="button"
                        variant="outline"
                        title={`Reset ${row.label} to environment`}
                        disabled={resetMut.isPending}
                        onClick={() => resetMut.mutate(row.key)}
                      >
                        Reset to env
                      </Button>
                    )}
                    <Switch
                      checked={on}
                      disabled={!isAdmin || mutation.isPending || !data}
                      onCheckedChange={(next) => onToggle(row.key, next)}
                      title={row.title}
                      aria-label={row.title}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {!isAdmin && <p className="mt-3 text-xs text-text-muted">Read-only for the developer role.</p>}
        {mutation.isError && <p className="mt-3 text-sm text-train">{(mutation.error as Error).message}</p>}
        {resetMut.isError && <p className="mt-3 text-sm text-train">{(resetMut.error as Error).message}</p>}
      </AdminCard>
      <AdminCard title="Recent flag actions">
        <AdminTable headers={["When", "Action", "Actor"]} empty={auditRows.length === 0} emptyLabel="No flag audits yet.">
          {auditRows.map((row) => (
            <tr key={row.id} className="border-b border-border last:border-0">
              <td className="px-3 py-2 text-xs text-text-muted">{new Date(row.createdAt).toLocaleString()}</td>
              <td className="px-3 py-2">{row.action}</td>
              <td className="px-3 py-2 font-mono text-xs">{row.actorUserId}</td>
            </tr>
          ))}
        </AdminTable>
      </AdminCard>
      <AlertDialog open={pendingSignup !== null} onOpenChange={(open) => !open && setPendingSignup(null)}>
        <AlertDialogContent title="Disable public signup?">
          <h3 className="text-lg font-semibold">Disable public signup?</h3>
          <p className="mt-2 text-sm text-text-muted">
            /signup will show as closed. Invite from Users or npm run auth:create-user.
          </p>
          <div className="mt-4 flex gap-2">
            <Button type="button" variant="outline" title="Cancel" onClick={() => setPendingSignup(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              title="Disable public signup"
              onClick={() => {
                mutation.mutate({ signup_disabled: true });
                setPendingSignup(null);
              }}
            >
              Disable signup
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </AdminSection>
  );
}
