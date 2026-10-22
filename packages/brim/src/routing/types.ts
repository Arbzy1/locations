export type RoutingCapabilities = {
  tolls: boolean;
  fuelEstimate: boolean;
  roadComposition: boolean;
  alternatives: boolean;
};

export type RoutePlace =
  | string
  | {
      lat: number;
      lng: number;
      label?: string;
    };

export type RouteRequest = {
  origin: RoutePlace;
  destination: RoutePlace;
  waypoints?: RoutePlace[] | undefined;
  mode: "basic" | "advanced";
  departureTime?: string | undefined;
  emissionType?: "GASOLINE" | "DIESEL" | "HYBRID" | "ELECTRIC" | undefined;
};

export type RouteLabel = "default" | "alternate" | "fuel-efficient";

export type LatLng = { lat: number; lng: number };

export type RouteAlternative = {
  id: string;
  label: RouteLabel;
  distanceMeters: number;
  durationSeconds: number;
  encodedPolyline: string;
  durationTrafficSeconds?: number;
  start?: LatLng;
  end?: LatLng;
};

export type RouteResponse = {
  distanceMeters: number;
  durationSeconds: number;
  encodedPolyline: string;
  providerFuelLitres?: number;
  roadComposition?: { urban: number; rural: number; motorway: number };
  routeLabel?: RouteLabel;
  durationTrafficSeconds?: number;
  start?: LatLng;
  end?: LatLng;
  alternatives?: RouteAlternative[];
};

export type RoutingErrorCode = "quota" | "auth" | "invalid-request" | "upstream";

export class RoutingError extends Error {
  constructor(
    readonly code: RoutingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RoutingError";
  }
}

export interface RoutingProvider {
  readonly name: string;
  readonly capabilities: RoutingCapabilities;
  computeRoute(req: RouteRequest): Promise<RouteResponse>;
}
