import { useQuery } from "@tanstack/react-query";
import { adminJson } from "../../lib/admin-api";
import { AdminCard, AdminError, AdminSection } from "./AdminSection";
import { AdminSkeletonList, AdminStatus, boolStatus } from "./AdminUi";

export function AdminDemoPage() {
  const { data, isError, isPending } = useQuery({
    queryKey: ["admin-demo"],
    queryFn: () => adminJson<{ exists: boolean }>("/api/admin/demo"),
  });
  if (isError) return <AdminError />;
  const exists = boolStatus(Boolean(data?.exists), "Exists", "Missing", "warn");
  return (
    <AdminSection
      title="Demo"
      description="Read-only. Create or reset the demo user with npm run auth:create-demo. The password is never shown here."
    >
      <AdminCard>
        {isPending ? (
          <AdminSkeletonList rows={1} />
        ) : (
          <div className="flex min-h-11 items-center gap-3">
            <span className="text-sm text-text">Demo account</span>
            <AdminStatus tone={exists.tone}>{exists.label}</AdminStatus>
          </div>
        )}
      </AdminCard>
    </AdminSection>
  );
}
