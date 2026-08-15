import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../../lib/auth";
import { adminJson } from "../../lib/admin-api";
import { Switch } from "../ui/switch";
import { AdminCard, AdminError, AdminSection } from "./AdminSection";

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
};

const ROWS: { key: FlagKey; flag: keyof FlagsResponse["flags"]; label: string; title: string }[] = [
  { key: "signup_disabled", flag: "signupDisabled", label: "Disable signup", title: "Block public signup" },
  { key: "landing_enabled", flag: "landingEnabled", label: "Landing page", title: "Show the public landing page" },
  { key: "globe_enabled", flag: "globeEnabled", label: "Globe", title: "Show the coverage globe" },
  { key: "demo_tour", flag: "demoTour", label: "Demo tour", title: "Show the skippable demo tour" },
];

export function AdminFlagsPage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";
  const queryClient = useQueryClient();
  const { data, isError } = useQuery({
    queryKey: ["admin-flags"],
    queryFn: () => adminJson<FlagsResponse>("/api/admin/flags"),
  });
  const mutation = useMutation({
    mutationFn: (patch: Partial<Record<FlagKey, boolean>>) =>
      adminJson<FlagsResponse>("/api/admin/flags", { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-flags"] });
      void queryClient.invalidateQueries({ queryKey: ["public-config"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
    },
  });
  if (isError) return <AdminError />;
  return (
    <AdminSection
      title="Flags"
      description="Database overlay on wrangler env. Developers can read; only admins can toggle."
    >
      <AdminCard>
        <ul className="space-y-3">
          {ROWS.map((row) => {
            const on = Boolean(data?.flags[row.flag]);
            return (
              <li key={row.key} className="flex min-h-11 items-center justify-between gap-3">
                <div>
                  <div className="text-sm text-text">{row.label}</div>
                  <div className="text-xs text-text-muted">
                    Source: {data?.source[row.key] ?? "env"}
                  </div>
                </div>
                <Switch
                  checked={on}
                  disabled={!isAdmin || mutation.isPending || !data}
                  onCheckedChange={(next) => mutation.mutate({ [row.key]: next })}
                  title={row.title}
                  aria-label={row.title}
                />
              </li>
            );
          })}
        </ul>
        {!isAdmin && (
          <p className="text-xs text-text-muted">Read-only for the developer role.</p>
        )}
        {mutation.isError && (
          <p className="text-sm text-train">{(mutation.error as Error).message}</p>
        )}
      </AdminCard>
    </AdminSection>
  );
}
