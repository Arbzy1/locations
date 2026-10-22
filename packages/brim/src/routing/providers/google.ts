import type {
  LatLng,
  RouteAlternative,
  RouteLabel,
  RouteRequest,
  RouteResponse,
  RoutingProvider,
} from "../types.js";
import { RoutingError } from "../types.js";
import { googlePlace } from "../place.js";

export type GoogleMode = "basic" | "advanced";

const SHARED_MASK =
  "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.routeLabels,routes.viewport,routes.legs.startLocation,routes.legs.endLocation";
const BASIC_MASK = SHARED_MASK;
const ADVANCED_MASK = `${SHARED_MASK},routes.staticDuration,routes.travelAdvisory.fuelConsumptionMicroliters,routes.travelAdvisory.tollInfo`;

type GoogleLatLng = { latitude?: number; longitude?: number };
type GoogleRoute = {
  distanceMeters?: number;
  duration?: string;
  staticDuration?: string;
  polyline?: { encodedPolyline?: string };
  routeLabels?: string[];
  travelAdvisory?: { fuelConsumptionMicroliters?: string };
  legs?: Array<{
    startLocation?: { latLng?: GoogleLatLng };
    endLocation?: { latLng?: GoogleLatLng };
  }>;
};

function parseDuration(value: string | undefined): number {
  if (!value) return 0;
  return Number.parseFloat(value.replace("s", ""));
}

function toLatLng(ll?: GoogleLatLng): LatLng | undefined {
  if (ll?.latitude === undefined || ll.longitude === undefined) return undefined;
  return { lat: ll.latitude, lng: ll.longitude };
}

function mapLabel(labels?: string[]): RouteLabel {
  if (labels?.includes("FUEL_EFFICIENT")) return "fuel-efficient";
  if (labels?.includes("DEFAULT_ROUTE_ALTERNATE")) return "alternate";
  return "default";
}

function parseRoute(route: GoogleRoute, index: number, advanced: boolean): RouteAlternative | undefined {
  if (!route.distanceMeters || !route.polyline?.encodedPolyline) return undefined;
  const duration = parseDuration(route.duration);
  const staticDuration = parseDuration(route.staticDuration);
  const start = toLatLng(route.legs?.[0]?.startLocation?.latLng);
  const end = toLatLng(route.legs?.[route.legs.length - 1]?.endLocation?.latLng);
  const alt: RouteAlternative = {
    id: `route-${index}`,
    label: mapLabel(route.routeLabels),
    distanceMeters: route.distanceMeters,
    durationSeconds: duration,
    encodedPolyline: route.polyline.encodedPolyline,
  };
  if (advanced && staticDuration > 0 && duration > 0) alt.durationTrafficSeconds = duration;
  if (start) alt.start = start;
  if (end) alt.end = end;
  return alt;
}

export class GoogleRoutesProvider implements RoutingProvider {
  readonly name = "google";

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get capabilities() {
    return {
      tolls: true,
      fuelEstimate: true,
      roadComposition: false,
      alternatives: true,
    };
  }

  async computeRoute(req: RouteRequest): Promise<RouteResponse> {
    const advanced = req.mode === "advanced";
    const body: Record<string, unknown> = {
      origin: googlePlace(req.origin),
      destination: googlePlace(req.destination),
      travelMode: "DRIVE",
      computeAlternativeRoutes: true,
      polylineQuality: "HIGH_QUALITY",
    };
    if (req.waypoints && req.waypoints.length > 0) {
      body.intermediates = req.waypoints.map(googlePlace);
    }
    if (advanced) {
      body.routingPreference = "TRAFFIC_AWARE_OPTIMAL";
      body.extraComputations = ["FUEL_CONSUMPTION", "TOLLS"];
      if (req.departureTime) body.departureTime = req.departureTime;
      if (req.emissionType) {
        body.routeModifiers = { vehicleInfo: { emissionType: req.emissionType } };
      }
    }
    const res = await this.fetchImpl("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.apiKey,
        "X-Goog-FieldMask": advanced ? ADVANCED_MASK : BASIC_MASK,
      },
      body: JSON.stringify(body),
    });
    if (res.status === 401 || res.status === 403) throw new RoutingError("auth", "Google auth failed");
    if (res.status === 429) throw new RoutingError("quota", "Google quota exceeded");
    if (res.status === 400) throw new RoutingError("invalid-request", "Google rejected the request");
    if (!res.ok) throw new RoutingError("upstream", `Google ${res.status}`);
    const json = (await res.json()) as { routes?: GoogleRoute[] };
    const parsed = (json.routes ?? [])
      .map((route, i) => parseRoute(route, i, advanced))
      .filter((r): r is RouteAlternative => Boolean(r));
    const primary =
      parsed.find((r) => r.label === "default") ?? parsed[0];
    if (!primary) throw new RoutingError("upstream", "Google returned an empty route");
    const microlitres = json.routes?.[0]?.travelAdvisory?.fuelConsumptionMicroliters;
    const response: RouteResponse = {
      distanceMeters: primary.distanceMeters,
      durationSeconds: primary.durationSeconds,
      encodedPolyline: primary.encodedPolyline,
      routeLabel: primary.label,
      alternatives: parsed,
    };
    if (primary.durationTrafficSeconds !== undefined) {
      response.durationTrafficSeconds = primary.durationTrafficSeconds;
    }
    if (primary.start) response.start = primary.start;
    if (primary.end) response.end = primary.end;
    if (microlitres) response.providerFuelLitres = Number(microlitres) / 1_000_000;
    return response;
  }
}

export const GOOGLE_FIELD_MASKS = { basic: BASIC_MASK, advanced: ADVANCED_MASK };
