import { describe, expect, it } from "vitest";
import { OsrmProvider } from "@locations/brim/routing/providers/osrm.js";
import { GoogleGeocoder } from "@locations/brim/routing/geocode/google.js";
import { pullCarbonIntensity } from "@locations/brim/shared/carbon/pull.js";

/**
 * Behaves like the Cloudflare Workers fetch: called with any `this` but the global
 * (for example as `this.fetchImpl(url)` or `deps.fetch(url)`), it throws. Node's fetch
 * does not check, which is how the live Journey cost estimate returned 500.
 */
function workersFetch(body: unknown) {
  const calls: string[] = [];
  const fn = function (this: unknown, input: string | URL | Request) {
    if (this !== undefined && this !== globalThis) {
      throw new TypeError("Illegal invocation: function called with incorrect `this` reference.");
    }
    calls.push(String(input));
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  } as unknown as typeof fetch;
  return { fn, calls };
}

describe("fetch kept on objects (Workers 'Illegal invocation')", () => {
  it("OSRM routing calls fetch unbound", async () => {
    const { fn, calls } = workersFetch({ routes: [{ distance: 41000, duration: 2700, geometry: "_p~iF~ps|U" }] });
    const route = await new OsrmProvider("https://osrm.example", fn).computeRoute({
      origin: { lat: 52.48, lng: -1.9 },
      destination: { lat: 52.19, lng: -2.22 },
    } as never);
    expect(route.distanceMeters).toBe(41000);
    expect(calls[0]).toContain("/route/v1/driving/");
  });

  it("Google address search calls fetch unbound", async () => {
    const { fn } = workersFetch({ suggestions: [] });
    await expect(new GoogleGeocoder("key", fn).autocomplete("Worcester")).resolves.toEqual([]);
  });

  it("the carbon sync calls the fetch it was handed unbound", async () => {
    const { fn, calls } = workersFetch({ data: [] });
    await pullCarbonIntensity({ fetch: fn, nowIso: "2026-10-24T12:00:00Z" });
    expect(calls).toHaveLength(1);
  });
});
