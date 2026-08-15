import { useQuery } from "@tanstack/react-query";
import { adminJson } from "../../lib/admin-api";
import { AdminCard, AdminError, AdminSection } from "./AdminSection";

export function AdminDemoPage() {
  const { data, isError } = useQuery({
    queryKey: ["admin-demo"],
    queryFn: () => adminJson<{ exists: boolean }>("/api/admin/demo"),
  });
  if (isError) return <AdminError />;
  return (
    <AdminSection
      title="Demo"
      description="Read-only. Create or reset the demo user with npm run auth:create-demo. The password is never shown here."
    >
      <AdminCard>
        <p className="text-sm">Demo account exists: {String(data?.exists ?? false)}</p>
      </AdminCard>
    </AdminSection>
  );
}
