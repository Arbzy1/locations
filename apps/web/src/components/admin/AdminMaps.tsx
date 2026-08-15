import { useQuery } from "@tanstack/react-query";
import { adminJson } from "../../lib/admin-api";
import { AdminCard, AdminError, AdminSection } from "./AdminSection";

type Maps = {
  commercialTiles: boolean;
  osrmConfigured: boolean;
  geocodeConfigured: boolean;
  customHostsAllowlist: boolean;
};

export function AdminMapsPage() {
  const { data, isError } = useQuery({
    queryKey: ["admin-maps"],
    queryFn: () => adminJson<Maps>("/api/admin/maps"),
  });
  if (isError) return <AdminError />;
  return (
    <AdminSection title="Maps" description="Whether commercial tiles, routing, and geocode env are set. Keys stay in Worker secrets.">
      <AdminCard>
        <ul className="space-y-1 text-sm">
          <li>Commercial tiles: {String(data?.commercialTiles ?? false)}</li>
          <li>OSRM configured: {String(data?.osrmConfigured ?? false)}</li>
          <li>Geocode configured: {String(data?.geocodeConfigured ?? false)}</li>
          <li>Custom host allowlist: {String(data?.customHostsAllowlist ?? false)}</li>
        </ul>
      </AdminCard>
    </AdminSection>
  );
}
