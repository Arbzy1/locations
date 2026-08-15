import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSession } from "../../lib/auth";
import { adminJson } from "../../lib/admin-api";
import { Button } from "../ui/button";
import { AdminCard, AdminError, AdminSection } from "./AdminSection";
import { AdminEmpty, AdminSkeletonList, AdminStat, AdminStatus, boolStatus } from "./AdminUi";

type Email = {
  kinds: string[];
  lastRecap: { considered: number; sent: number; at?: string } | null;
  resendConfigured: boolean;
};

export function AdminEmailPage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";
  const { data, isError, isPending } = useQuery({
    queryKey: ["admin-email"],
    queryFn: () => adminJson<Email>("/api/admin/email"),
  });
  const testMut = useMutation({
    mutationFn: () =>
      adminJson<{ result: "sent" | "skipped" | "failed" }>("/api/admin/email/test", {
        method: "POST",
        body: JSON.stringify({ kind: "password_changed" }),
      }),
    onSuccess: (body) => {
      if (body.result === "sent") toast.success("Test email sent to your account.");
      else if (body.result === "skipped") toast.message("Skipped. Resend is not configured.");
      else toast.error("Send failed.");
    },
    onError: (err: Error) => toast.error(err.message),
  });
  if (isError) return <AdminError />;
  const resend = boolStatus(Boolean(data?.resendConfigured), "Configured", "Missing", "warn");
  return (
    <AdminSection title="Email" description="Transactional kinds only. Recipients are never listed. Self-test goes to your session email.">
      <AdminCard title="Provider">
        {isPending ? (
          <AdminSkeletonList rows={1} />
        ) : (
          <div className="flex min-h-11 items-center gap-3">
            <span className="text-sm text-text">Resend</span>
            <AdminStatus tone={resend.tone}>{resend.label}</AdminStatus>
          </div>
        )}
        {isAdmin && (
          <Button
            type="button"
            className="mt-3"
            variant="outline"
            title="Send a password-changed test to your session email"
            disabled={testMut.isPending}
            onClick={() => testMut.mutate()}
          >
            Send test to me
          </Button>
        )}
      </AdminCard>
      <AdminCard title="Last monthly recap cron">
        {isPending ? (
          <AdminSkeletonList rows={2} />
        ) : data?.lastRecap ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <AdminStat value={data.lastRecap.considered} label="Considered" />
            <AdminStat value={data.lastRecap.sent} label="Sent" tone="ok" />
          </div>
        ) : (
          <AdminEmpty>No cron result stored yet.</AdminEmpty>
        )}
        {data?.lastRecap?.at && <p className="mt-3 text-xs text-text-muted">{data.lastRecap.at}</p>}
      </AdminCard>
      <AdminCard title="Kinds">
        {isPending ? (
          <AdminSkeletonList rows={4} />
        ) : (data?.kinds ?? []).length === 0 ? (
          <AdminEmpty>No kinds listed.</AdminEmpty>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(data?.kinds ?? []).map((kind) => (
              <AdminStatus key={kind}>{kind}</AdminStatus>
            ))}
          </div>
        )}
      </AdminCard>
    </AdminSection>
  );
}
