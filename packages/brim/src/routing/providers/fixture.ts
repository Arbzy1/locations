import { distanceMeters, encodePolyline, UK_PLACES } from '../../shared/index.js';
import type { RoutePlace, RouteRequest, RouteResponse, RoutingProvider } from "../types.js";
import { RoutingError } from "../types.js";
import { fixturePlaceKey } from "../place.js";

export type RecordedRoute = RouteResponse & { id: string; origin: string; destination: string };

function place(label: string) {
  const hit = UK_PLACES.find((p) => p.label === label);
  if (!hit) throw new Error(`missing fixture place ${label}`);
  return hit;
}

function line(origin: string, destination: string): string {
  const a = place(origin);
  const b = place(destination);
  return encodePolyline([
    { lat: a.lat, lng: a.lng },
    { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 },
    { lat: b.lat, lng: b.lng },
  ]);
}

function asLatLng(place: RoutePlace): { lat: number; lng: number } {
  if (typeof place !== "string") return { lat: place.lat, lng: place.lng };
  const hit = UK_PLACES.find((p) => p.label.toLowerCase() === place.toLowerCase());
  if (!hit) throw new Error(`missing fixture place ${place}`);
  return { lat: hit.lat, lng: hit.lng };
}

function viaDistance(req: RouteRequest): { meters: number; encodedPolyline: string } | undefined {
  if (!req.waypoints?.length) return undefined;
  const pts = [asLatLng(req.origin), ...req.waypoints.map(asLatLng), asLatLng(req.destination)];
  let meters = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    meters += distanceMeters(pts[i]!, pts[i + 1]!);
  }
  return { meters: Math.round(meters), encodedPolyline: encodePolyline(pts) };
}

function altLine(origin: string, destination: string): string {
  const a = place(origin);
  const b = place(destination);
  return encodePolyline([
    { lat: a.lat, lng: a.lng },
    { lat: (a.lat + b.lat) / 2 + 0.04, lng: (a.lng + b.lng) / 2 + 0.04 },
    { lat: b.lat, lng: b.lng },
  ]);
}

const RECORDED: RecordedRoute[] = [
  {
    id: "crawley-london",
    origin: "Crawley",
    destination: "London",
    distanceMeters: 51000,
    durationSeconds: 4200,
    encodedPolyline: line("Crawley", "London"),
    roadComposition: { urban: 0.4, rural: 0.1, motorway: 0.5 },
  },
  {
    id: "manchester-leeds",
    origin: "Manchester",
    destination: "Leeds",
    distanceMeters: 72000,
    durationSeconds: 3600,
    encodedPolyline: line("Manchester", "Leeds"),
  },
  {
    id: "birmingham-bristol",
    origin: "Birmingham",
    destination: "Bristol",
    distanceMeters: 145000,
    durationSeconds: 7200,
    encodedPolyline: line("Birmingham", "Bristol"),
  },
  {
    id: "edinburgh-glasgow",
    origin: "Edinburgh",
    destination: "Glasgow",
    distanceMeters: 75000,
    durationSeconds: 3900,
    encodedPolyline: line("Edinburgh", "Glasgow"),
  },
  {
    id: "cardiff-swansea",
    origin: "Cardiff",
    destination: "Swansea",
    distanceMeters: 67000,
    durationSeconds: 3600,
    encodedPolyline: line("Cardiff", "Swansea"),
  },
  {
    id: "newcastle-york",
    origin: "Newcastle",
    destination: "York",
    distanceMeters: 135000,
    durationSeconds: 5400,
    encodedPolyline: line("Newcastle", "York"),
  },
  {
    id: "bristol-bath",
    origin: "Bristol",
    destination: "Bath",
    distanceMeters: 21000,
    durationSeconds: 2400,
    encodedPolyline: line("Bristol", "Bath"),
  },
  {
    id: "dartford-thurrock",
    origin: "Dartford",
    destination: "Thurrock",
    distanceMeters: 9000,
    durationSeconds: 900,
    encodedPolyline: line("Dartford", "Thurrock"),
  },
  {
    id: "coleshill-cannock",
    origin: "Coleshill",
    destination: "Cannock",
    distanceMeters: 28000,
    durationSeconds: 1500,
    encodedPolyline: line("Coleshill", "Cannock"),
  },
  {
    id: "runcorn-widnes",
    origin: "Runcorn",
    destination: "Widnes",
    distanceMeters: 5000,
    durationSeconds: 480,
    encodedPolyline: line("Runcorn", "Widnes"),
  },
  {
    id: "jarrow-howdon",
    origin: "Jarrow",
    destination: "Howdon",
    distanceMeters: 4000,
    durationSeconds: 420,
    encodedPolyline: line("Jarrow", "Howdon"),
  },
];

export class FixtureProvider implements RoutingProvider {
  readonly name = "fixture";
  readonly capabilities = {
    tolls: false,
    fuelEstimate: true,
    roadComposition: true,
    alternatives: true,
  };

  constructor(private readonly routes: RecordedRoute[] = RECORDED) {}

  async computeRoute(req: RouteRequest): Promise<RouteResponse> {
    const via = viaDistance(req);
    const originKey = fixturePlaceKey(req.origin);
    const destKey = fixturePlaceKey(req.destination);
    const hit =
      this.routes.find(
        (r) => r.origin.toLowerCase() === originKey && r.destination.toLowerCase() === destKey,
      ) ?? this.routes[0];
    if (!hit) throw new RoutingError("invalid-request", "no fixture routes");
    const distanceMetersValue = via?.meters ?? hit.distanceMeters;
    const durationSeconds = via
      ? Math.max(60, Math.round(via.meters / 12))
      : hit.durationSeconds;
    const encodedPolyline = via?.encodedPolyline ?? hit.encodedPolyline;
    const fuel = req.mode === "advanced" ? (distanceMetersValue / 1000 / 100) * 7.5 : undefined;
    const response: RouteResponse = {
      distanceMeters: distanceMetersValue,
      durationSeconds,
      encodedPolyline,
    };
    if (fuel !== undefined) response.providerFuelLitres = fuel;
    if (hit.roadComposition) response.roadComposition = hit.roadComposition;
    const originHit = place(hit.origin);
    const destHit = place(hit.destination);
    response.start = { lat: originHit.lat, lng: originHit.lng };
    response.end = { lat: destHit.lat, lng: destHit.lng };
    response.routeLabel = "default";
    response.alternatives = [
      {
        id: "route-0",
        label: "default",
        distanceMeters: distanceMetersValue,
        durationSeconds,
        encodedPolyline,
        start: response.start,
        end: response.end,
      },
      {
        id: "route-1",
        label: "alternate",
        distanceMeters: Math.round(distanceMetersValue * 1.08),
        durationSeconds: Math.round(durationSeconds * 1.12),
        encodedPolyline: via?.encodedPolyline ?? altLine(hit.origin, hit.destination),
        start: response.start,
        end: response.end,
      },
    ];
    return response;
  }
}

export const UK_FIXTURE_ROUTES = RECORDED;
