import { useQuery } from "@tanstack/react-query";
import { adminJson } from "../../lib/admin-api";
import { Button } from "../ui/button";
import { AdminCard, AdminError, AdminSection } from "./AdminSection";
import { AdminDl, AdminSkeletonList, AdminStatus, boolStatus } from "./AdminUi";

type Maps = {
  commercialTiles: boolean;
  osrmConfigured: boolean;
  geocodeConfigured: boolean;
  customHostsAllowlist: boolean;
  customHostCount: number;
};

type Probe = { probes: { name: string; ok: boolean; status: number; ms: number }[] };

export function AdminMapsPage() {
  const { data, isError, isPending } = useQuery({
    queryKey: ["admin-maps"],
    queryFn: () => adminJson<Maps>("/api/admin/maps"),
  });
  const probe = useQuery({
    queryKey: ["admin-maps-probe"],
    queryFn: () => adminJson<Probe>("/api/admin/maps/probe"),
    enabled: false,
  });
  if (isError) return <AdminError />;
  const tiles = boolStatus(Boolean(data?.commercialTiles), "Configured", "Missing", "warn");
  const osrm = boolStatus(Boolean(data?.osrmConfigured), "Configured", "Missing", "warn");
  const geocode = boolStatus(Boolean(data?.geocodeConfigured), "Configured", "Missing", "warn");
  const hosts = boolStatus(Boolean(data?.customHostsAllowlist), "Allowlist set", "Not set", "warn");
  return (
    <AdminSection title="Maps" description="Whether commercial tiles, routing, and geocode env are set. Keys stay in Worker secrets. The allowlist is env-only.">
      <AdminCard>
        {isPending ? (
          <AdminSkeletonList rows={5} />
        ) : (
          <AdminDl
            rows={[
              { label: "Commercial tiles", value: <AdminStatus tone={tiles.tone}>{tiles.label}</AdminStatus> },
              { label: "OSRM", value: <AdminStatus tone={osrm.tone}>{osrm.label}</AdminStatus> },
              { label: "Geocode", value: <AdminStatus tone={geocode.tone}>{geocode.label}</AdminStatus> },
              { label: "Custom host allowlist", value: <AdminStatus tone={hosts.tone}>{hosts.label}</AdminStatus> },
              { label: "Custom hosts", value: String(data?.customHostCount ?? 0) },
            ]}
          />
        )}
      </AdminCard>
      <AdminCard title="Probe">
        <p className="text-xs text-text-muted">Fetches tile, OSRM, and geocode with a short timeout. Responses are name, ok, status, and ms only.</p>
        <Button
          type="button"
          className="mt-3"
          variant="outline"
          title="Probe map vendors"
          disabled={probe.isFetching}
          onClick={() => void probe.refetch()}
        >
          Run probe
        </Button>
        {probe.isError && <p className="mt-2 text-sm text-train">Probe failed.</p>}
        {(probe.data?.probes ?? []).length > 0 && (
          <ul className="mt-3 space-y-2">
            {probe.data?.probes.map((row) => (
              <li key={row.name} className="flex min-h-11 items-center justify-between gap-2 text-sm">
                <span className="capitalize">{row.name}</span>
                <span className="flex items-center gap-2 text-text-muted">
                  {row.status} · {row.ms}ms
                  <AdminStatus tone={row.ok ? "ok" : "danger"}>{row.ok ? "Pass" : "Fail"}</AdminStatus>
                </span>
              </li>
            ))}
          </ul>
        )}
      </AdminCard>
    </AdminSection>
  );
}
