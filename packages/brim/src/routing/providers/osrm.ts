import { unboundFetch, type FetchFn } from "../../shared/unbound-fetch.js";
import type { RouteAlternative, RouteRequest, RouteResponse, RoutingProvider } from "../types.js";
import { RoutingError } from "../types.js";
import { osrmCoord } from "../place.js";

export class OsrmProvider implements RoutingProvider {
  readonly name = "osrm";
  readonly capabilities = {
    tolls: false,
    fuelEstimate: false,
    roadComposition: false,
    alternatives: true,
  } as const;

  private readonly fetchImpl: FetchFn;

  constructor(
    private readonly baseUrl: string,
    fetchImpl: FetchFn = fetch,
  ) {
    this.fetchImpl = unboundFetch(fetchImpl);
  }

  async computeRoute(req: RouteRequest): Promise<RouteResponse> {
    const points = [req.origin, ...(req.waypoints ?? []), req.destination].map(osrmCoord);
    const path = points.join(";");
    const url = `${this.baseUrl.replace(/\/$/, "")}/route/v1/driving/${path}?overview=full&geometries=polyline&alternatives=true`;
    // Workers send no User-Agent; the public OSRM server answers 403 without one.
    const res = await this.fetchImpl(url, { headers: { "User-Agent": "LocationsJourneyCost/1.0 (+https://locations.aden.website)" } });
    if (!res.ok) {
      throw new RoutingError("upstream", `OSRM ${res.status}`);
    }
    const body = (await res.json()) as {
      routes?: Array<{ distance: number; duration: number; geometry: string }>;
    };
    const routes = body.routes ?? [];
    const first = routes[0];
    if (!first) throw new RoutingError("invalid-request", "OSRM returned no route");
    const alternatives: RouteAlternative[] = routes.map((route, i) => ({
      id: `route-${i}`,
      label: i === 0 ? "default" : "alternate",
      distanceMeters: route.distance,
      durationSeconds: route.duration,
      encodedPolyline: route.geometry,
    }));
    return {
      distanceMeters: first.distance,
      durationSeconds: first.duration,
      encodedPolyline: first.geometry,
      routeLabel: "default",
      alternatives,
    };
  }
}
