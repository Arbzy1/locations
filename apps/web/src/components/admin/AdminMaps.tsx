import { useQuery } from "@tanstack/react-query";
import { adminJson } from "../../lib/admin-api";
import { AdminCard, AdminError, AdminSection } from "./AdminSection";
import { AdminDl, AdminSkeletonList, AdminStatus, boolStatus } from "./AdminUi";

type Maps = {
  commercialTiles: boolean;
  osrmConfigured: boolean;
  geocodeConfigured: boolean;
  customHostsAllowlist: boolean;
};

export function AdminMapsPage() {
  const { data, isError, isPending } = useQuery({
    queryKey: ["admin-maps"],
    queryFn: () => adminJson<Maps>("/api/admin/maps"),
  });
  if (isError) return <AdminError />;
  const tiles = boolStatus(Boolean(data?.commercialTiles), "Configured", "Missing", "warn");
  const osrm = boolStatus(Boolean(data?.osrmConfigured), "Configured", "Missing", "warn");
  const geocode = boolStatus(Boolean(data?.geocodeConfigured), "Configured", "Missing", "warn");
  const hosts = boolStatus(Boolean(data?.customHostsAllowlist), "Allowlist set", "Not set", "warn");
  return (
    <AdminSection title="Maps" description="Whether commercial tiles, routing, and geocode env are set. Keys stay in Worker secrets.">
      <AdminCard>
        {isPending ? (
          <AdminSkeletonList rows={4} />
        ) : (
          <AdminDl
            rows={[
              { label: "Commercial tiles", value: <AdminStatus tone={tiles.tone}>{tiles.label}</AdminStatus> },
              { label: "OSRM", value: <AdminStatus tone={osrm.tone}>{osrm.label}</AdminStatus> },
              { label: "Geocode", value: <AdminStatus tone={geocode.tone}>{geocode.label}</AdminStatus> },
              { label: "Custom host allowlist", value: <AdminStatus tone={hosts.tone}>{hosts.label}</AdminStatus> },
            ]}
          />
        )}
      </AdminCard>
    </AdminSection>
  );
}
