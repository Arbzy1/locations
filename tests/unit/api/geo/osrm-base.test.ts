import { afterEach, describe, expect, it, vi } from "vitest";
import { osrmRoot } from "@locations/api/osrm-base";
import { configureGeoEndpoints, fetchRoute } from "@locations/api/services";

describe("osrmRoot", () => {
  it("returns undefined when unset or blank", () => {
    expect(osrmRoot(undefined)).toBeUndefined();
    expect(osrmRoot("  ")).toBeUndefined();
  });

  it("accepts the server root, with or without a trailing slash", () => {
    expect(osrmRoot("https://osrm.example")).toBe("https://osrm.example");
    expect(osrmRoot("https://osrm.example/")).toBe("https://osrm.example");
  });

  it("reduces the older service URLs to the server root", () => {
    expect(osrmRoot("https://osrm.example/route/v1")).toBe("https://osrm.example");
    expect(osrmRoot("https://osrm.example/route/v1/")).toBe("https://osrm.example");
    expect(osrmRoot("https://osrm.example/match/v1")).toBe("https://osrm.example");
  });

  it("keeps a path prefix in front of the service", () => {
    expect(osrmRoot("https://maps.example/osrm/route/v1")).toBe("https://maps.example/osrm");
  });
});

describe("explorer routing URL", () => {
  const db = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
    insert: () => ({ values: () => ({ onConflictDoUpdate: async () => undefined }) }),
  };

  afterEach(() => {
    configureGeoEndpoints({});
    vi.unstubAllGlobals();
  });

  it.each(["https://osrm.example", "https://osrm.example/route/v1"])("builds the same URL from %s", async (base) => {
    configureGeoEndpoints({ OSRM_BASE: base });
    const fetchMock = vi.fn(async () => new Response("nope", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    await fetchRoute(db as never, 40.7, -74.0, 40.8, -73.9, "car");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("https://osrm.example/route/v1/driving/");
  });
});
