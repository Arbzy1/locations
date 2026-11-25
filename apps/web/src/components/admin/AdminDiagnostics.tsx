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
  googleMapsConfigured?: boolean;
  dvlaConfigured?: boolean;
  vrmEncryptionConfigured?: boolean;
  fuelFinderConfigured?: boolean;
  routingSpentUsd?: number;
  routingCeilingUsd?: number;
  fuelFinderWatermark?: string | null;
  carbonWatermark?: string | null;
};

export function AdminDiagnosticsPage() {
  const { data, isError, isPending } = useQuery({
    queryKey: ["admin-diagnostics"],
    queryFn: () => adminJson<Diagnostics>("/api/admin/diagnostics"),
  });
  if (isError) return <AdminError />;
  const spent = data?.routingSpentUsd ?? 0;
  const ceiling = data?.routingCeilingUsd ?? 50;
  const spendTone = spent >= ceiling ? ("danger" as const) : spent >= ceiling * 0.8 ? ("warn" as const) : ("ok" as const);
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
    { label: "Background job queue", value: boolStatus(Boolean(data?.queueConfigured), "Configured", "WaitUntil fallback", "neutral") },
    { label: "Google Maps (Routes / Places / Geocoding / Roads)", value: boolStatus(Boolean(data?.googleMapsConfigured), "Configured", "OSRM + Nominatim fallback", "neutral") },
    { label: "DVLA VES lookup", value: boolStatus(Boolean(data?.dvlaConfigured), "Configured", "Missing", "warn") },
    { label: "VRM plate encryption", value: boolStatus(Boolean(data?.vrmEncryptionConfigured), "Configured", "Missing", "warn") },
    { label: "Fuel Finder feed", value: boolStatus(Boolean(data?.fuelFinderConfigured), "Configured", "Missing", "warn") },
    {
      label: "Monthly Google routing spend",
      value: {
        tone: spendTone,
        label: `$${spent.toFixed(2)} / $${ceiling.toFixed(2)} USD`,
      },
    },
    {
      label: "Fuel Finder watermark",
      value: {
        tone: data?.fuelFinderWatermark ? ("ok" as const) : ("neutral" as const),
        label: data?.fuelFinderWatermark ?? "Not synced yet",
      },
    },
    {
      label: "Carbon intensity watermark",
      value: {
        tone: data?.carbonWatermark ? ("ok" as const) : ("neutral" as const),
        label: data?.carbonWatermark ?? "Not synced yet",
      },
    },
  ];
  return (
    <AdminSection
      title="Diagnostics"
      description="Configured vs missing only. Secrets stay in Worker bindings."
    >
      <AdminCard>
        {isPending ? (
          <AdminSkeletonList rows={12} />
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
