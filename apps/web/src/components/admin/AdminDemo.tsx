import { useQuery } from "@tanstack/react-query";
import { adminJson } from "../../lib/admin/admin-api";
import { AdminCard, AdminError, AdminSection } from "./AdminSection";
import { AdminDl, AdminSkeletonList, AdminStatus, boolStatus } from "./AdminUi";

type Demo =
  | { exists: false }
  | { exists: true; email: string; visitCount: number; sourceCount: number };

export function AdminDemoPage() {
  const { data, isError, isPending } = useQuery({
    queryKey: ["admin-demo"],
    queryFn: () => adminJson<Demo>("/api/admin/demo"),
  });
  if (isError) return <AdminError />;
  const exists = boolStatus(Boolean(data?.exists), "Exists", "Missing", "warn");
  return (
    <AdminSection
      title="Demo"
      description="Read-only. Create or reset with npm run auth:create-demo. The password is never shown here."
    >
      <AdminCard>
        {isPending ? (
          <AdminSkeletonList rows={3} />
        ) : (
          <AdminDl
            rows={[
              { label: "Demo account", value: <AdminStatus tone={exists.tone}>{exists.label}</AdminStatus> },
              ...(data?.exists
                ? [
                    { label: "Email", value: data.email },
                    { label: "Visits (demo tenant)", value: String(data.visitCount) },
                    { label: "Sources (demo tenant)", value: String(data.sourceCount) },
                  ]
                : []),
            ]}
          />
        )}
        <p className="mt-3 text-xs text-text-muted">
          Recreate stays on the CLI so a demo password never lands in the Admin UI or the client bundle.
        </p>
      </AdminCard>
    </AdminSection>
  );
}
