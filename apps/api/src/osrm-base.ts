/**
 * `OSRM_BASE` names the routing server: `https://osrm.example.com`. Older configs
 * pointed at the route service (`.../route/v1`), which the explorer needed and the
 * journey cost provider could not use. Both forms are accepted and reduced to the
 * server root here, so one setting works for the explorer, journey cost and the
 * admin probe.
 */
export function osrmRoot(base: string | undefined): string | undefined {
  const trimmed = base?.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/\/+$/, "").replace(/\/(route|match)\/v1$/, "");
}
