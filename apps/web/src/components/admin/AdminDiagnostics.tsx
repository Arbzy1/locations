import { useQuery } from "@tanstack/react-query";
import { adminJson } from "../../lib/admin/admin-api";
import { AdminCard, AdminError, AdminSection } from "./AdminSection";
import { AdminDl, AdminSkeletonList, AdminStatus, boolStatus } from "./AdminUi";
import { APP_VERSION_LABEL } from "../../lib/version";

type Diagnostics = {
  worker: boolean;
  db: boolean;
  flagsLoaded: boolean;
  version?: string;
  stripeConfigured: boolean;
  resendConfigured: boolean;
  r2Configured: boolean;
  queueConfigured: boolean;
};

export function AdminDiagnosticsPage() {
  const { data, isError, isPending } = useQuery({
    queryKey: ["admin-diagnostics"],
    queryFn: () => adminJson<Diagnostics>("/api/admin/diagnostics"),
  });
  if (isError) return <AdminError />;
  const rows = [
    { label: "Worker", value: boolStatus(Boolean(data?.worker), "Ok", "Down", "danger") },
    { label: "Neon", value: boolStatus(Boolean(data?.db), "Ok", "Error", "danger") },
    {
      label: "Version",
      value: {
        tone: "neutral" as const,
        label: data?.version ? `v${data.version.replace(/^v/i, "")}` : APP_VERSION_LABEL,
      },
    },
    { label: "Flags loaded", value: boolStatus(Boolean(data?.flagsLoaded), "Yes", "No", "warn") },
    { label: "Stripe", value: boolStatus(Boolean(data?.stripeConfigured), "Configured", "Missing", "warn") },
    { label: "Resend", value: boolStatus(Boolean(data?.resendConfigured), "Configured", "Missing", "warn") },
    { label: "R2", value: boolStatus(Boolean(data?.r2Configured), "Configured", "Missing", "warn") },
    { label: "Import queue", value: boolStatus(Boolean(data?.queueConfigured), "Configured", "Missing", "warn") },
  ];
  return (
    <AdminSection
      title="Diagnostics"
      description="Configured vs missing only. Secrets stay in Worker bindings."
    >
      <AdminCard>
        {isPending ? (
          <AdminSkeletonList rows={8} />
        ) : (
          <AdminDl
            rows={rows.map((row) => ({
              label: row.label,
              value: <AdminStatus tone={row.value.tone}>{row.value.label}</AdminStatus>,
            }))}
          />
        )}
      </AdminCard>
    </AdminSection>
  );
}
