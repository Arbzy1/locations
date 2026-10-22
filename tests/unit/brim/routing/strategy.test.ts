import { describe, expect, it } from "vitest";
import { decodePolyline } from "\@locations/brim/routing/polyline.js";
import { MemoryCache, cachedRoute } from "\@locations/brim/routing/cache.js";
import { FixtureProvider, UK_FIXTURE_ROUTES } from "\@locations/brim/routing/providers/fixture.js";
import { GoogleRoutesProvider, GOOGLE_FIELD_MASKS } from "\@locations/brim/routing/providers/google.js";
import { OsrmProvider } from "\@locations/brim/routing/providers/osrm.js";
import { selectRouteStrategy } from "\@locations/brim/routing/strategy.js";
import { budgetStatus } from "\@locations/brim/routing/budget.js";

describe("fixture provider", () => {
  it("covers six UK journeys and the interface", async () => {
    expect(UK_FIXTURE_ROUTES.length).toBeGreaterThanOrEqual(6);
    const p = new FixtureProvider();
    const r = await p.computeRoute({ origin: "Edinburgh", destination: "Glasgow", mode: "basic" });
    expect(r.distanceMeters).toBeGreaterThan(0);
    expect(p.capabilities.alternatives).toBe(true);
    expect(r.alternatives?.length).toBe(2);
    expect(r.start?.lat).toBeGreaterThan(50);
  });

  it("lengthens a recorded journey when a waypoint is added", async () => {
    const p = new FixtureProvider();
    const direct = await p.computeRoute({ origin: "Crawley", destination: "London", mode: "basic" });
    const via = await p.computeRoute({
      origin: "Crawley",
      destination: "London",
      waypoints: ["Birmingham"],
      mode: "basic",
    });
    expect(via.distanceMeters).toBeGreaterThan(direct.distanceMeters);
  });

  it("encodes polylines that decode inside the UK box", () => {
    for (const route of UK_FIXTURE_ROUTES) {
      const points = decodePolyline(route.encodedPolyline);
      expect(points.length).toBeGreaterThanOrEqual(2);
      for (const p of points) {
        expect(p.lat).toBeGreaterThanOrEqual(49.8);
        expect(p.lat).toBeLessThanOrEqual(58.7);
        expect(p.lng).toBeGreaterThanOrEqual(-8.2);
        expect(p.lng).toBeLessThanOrEqual(1.8);
      }
    }
  });
});

describe("strategy", () => {
  it("never selects advanced for a profiled vehicle", () => {
    const choice = selectRouteStrategy({ hasVehicleProfile: true });
    expect(choice.mode).toBe("basic");
    expect(choice.branch).toBe("profiled-basic");
  });
});

describe("cache", () => {
  it("makes exactly one compute on a repeated key", async () => {
    const store = new MemoryCache();
    let calls = 0;
    const run = () =>
      cachedRoute(store, "k", 3600, async () => {
        calls += 1;
        return { n: calls };
      });
    await run();
    await run();
    expect(calls).toBe(1);
  });
});

describe("budget", () => {
  it("marks ceiling breach", () => {
    expect(budgetStatus({ spentUsd: 10, ceilingUsd: 10 }).exceeded).toBe(true);
    expect(budgetStatus({ spentUsd: 6, ceilingUsd: 10 }).alert).toBe("60");
  });
});

describe("provider selection", () => {
  it("keeps a profiled vehicle on basic even when Google is available", async () => {
    const { chooseProvider } = await import("@locations/brim/routing/select.js");
    const choice = chooseProvider({
      fixtureMode: false,
      googleKey: "key",
      spentUsd: 0,
      ceilingUsd: 50,
      hasVehicleProfile: true,
    });
    expect(choice.mode).toBe("basic");
    expect(choice.provider.name).toBe("google");
  });

  it("fails over to OSRM when the spend ceiling is hit", async () => {
    const { chooseProvider } = await import("@locations/brim/routing/select.js");
    const choice = chooseProvider({
      fixtureMode: false,
      googleKey: "key",
      osrmUrl: "https://router.example/osrm",
      spentUsd: 50,
      ceilingUsd: 50,
      hasVehicleProfile: false,
    });
    expect(choice.exceeded).toBe(true);
    expect(choice.branch).toBe("osrm-failover");
    expect(choice.provider.name).toBe("osrm");
    expect(choice.mode).toBe("basic");
  });
});

describe("google adapter", () => {
  it("uses a geometry field mask without fuel on basic", () => {
    expect(GOOGLE_FIELD_MASKS.basic.includes("distanceMeters")).toBe(true);
    expect(GOOGLE_FIELD_MASKS.basic.includes("routeLabels")).toBe(true);
    expect(GOOGLE_FIELD_MASKS.basic.includes("fuelConsumption")).toBe(false);
    expect(GOOGLE_FIELD_MASKS.advanced.includes("staticDuration")).toBe(true);
  });

  it("requests HIGH_QUALITY polyline and alternatives", async () => {
    let payload: Record<string, unknown> = {};
    const provider = new GoogleRoutesProvider("test", async (_url, init) => {
      payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          routes: [
            {
              distanceMeters: 1000,
              duration: "60s",
              polyline: { encodedPolyline: "abc" },
              routeLabels: ["DEFAULT_ROUTE"],
              legs: [
                {
                  startLocation: { latLng: { latitude: 51.1, longitude: -0.18 } },
                  endLocation: { latLng: { latitude: 51.5, longitude: -0.12 } },
                },
              ],
            },
            {
              distanceMeters: 1200,
              duration: "80s",
              polyline: { encodedPolyline: "def" },
              routeLabels: ["DEFAULT_ROUTE_ALTERNATE"],
            },
          ],
        }),
        { status: 200 },
      );
    });
    const r = await provider.computeRoute({ origin: "A", destination: "B", mode: "basic" });
    expect(payload.computeAlternativeRoutes).toBe(true);
    expect(payload.polylineQuality).toBe("HIGH_QUALITY");
    expect(payload.routingPreference).toBeUndefined();
    expect(r.distanceMeters).toBe(1000);
    expect(r.alternatives).toHaveLength(2);
    expect(r.start).toEqual({ lat: 51.1, lng: -0.18 });
    expect(r.end).toEqual({ lat: 51.5, lng: -0.12 });
  });

  it("exposes traffic duration only in advanced mode", async () => {
    const provider = new GoogleRoutesProvider("test", async (_url, init) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("X-Goog-FieldMask") ?? "").toContain("staticDuration");
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body.routingPreference).toBe("TRAFFIC_AWARE_OPTIMAL");
      expect(body.polylineQuality).toBe("HIGH_QUALITY");
      return new Response(
        JSON.stringify({
          routes: [
            {
              distanceMeters: 1000,
              duration: "90s",
              staticDuration: "60s",
              polyline: { encodedPolyline: "abc" },
              routeLabels: ["DEFAULT_ROUTE"],
            },
          ],
        }),
        { status: 200 },
      );
    });
    const r = await provider.computeRoute({ origin: "A", destination: "B", mode: "advanced" });
    expect(r.durationSeconds).toBe(90);
    expect(r.durationTrafficSeconds).toBe(90);
  });

  it("sends latLng when origin and destination are coordinates", async () => {
    let payload: { origin?: unknown; destination?: unknown } = {};
    const provider = new GoogleRoutesProvider("test", async (_url, init) => {
      payload = JSON.parse(String(init?.body)) as typeof payload;
      return new Response(
        JSON.stringify({
          routes: [{ distanceMeters: 10, duration: "1s", polyline: { encodedPolyline: "abc" } }],
        }),
        { status: 200 },
      );
    });
    await provider.computeRoute({
      origin: { lat: 51.1092, lng: -0.1872 },
      destination: { lat: 51.5074, lng: -0.1278 },
      mode: "basic",
    });
    expect(payload.origin).toEqual({
      location: { latLng: { latitude: 51.1092, longitude: -0.1872 } },
    });
    expect(payload.destination).toEqual({
      location: { latLng: { latitude: 51.5074, longitude: -0.1278 } },
    });
  });

  it("sends address when origin and destination are strings", async () => {
    let payload: { origin?: unknown; destination?: unknown } = {};
    const provider = new GoogleRoutesProvider("test", async (_url, init) => {
      payload = JSON.parse(String(init?.body)) as typeof payload;
      return new Response(
        JSON.stringify({
          routes: [{ distanceMeters: 10, duration: "1s", polyline: { encodedPolyline: "abc" } }],
        }),
        { status: 200 },
      );
    });
    await provider.computeRoute({ origin: "Crawley", destination: "London", mode: "basic" });
    expect(payload.origin).toEqual({ address: "Crawley" });
    expect(payload.destination).toEqual({ address: "London" });
  });
});

describe("osrm adapter", () => {
  it("puts lng,lat in the path when given coordinates", async () => {
    let url = "";
    const provider = new OsrmProvider("https://router.example/osrm", async (input) => {
      url = String(input);
      return new Response(
        JSON.stringify({ routes: [{ distance: 100, duration: 20, geometry: "abc" }] }),
        { status: 200 },
      );
    });
    await provider.computeRoute({
      origin: { lat: 51.1, lng: -0.2 },
      destination: { lat: 51.5, lng: -0.1 },
      mode: "basic",
    });
    expect(url).toContain("/route/v1/driving/-0.2,51.1;-0.1,51.5?");
    expect(url).toContain("alternatives=true");
  });
});
