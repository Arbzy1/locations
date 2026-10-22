import { describe, expect, it } from "vitest";
import { MemoryCache } from "\@locations/brim/routing/cache.js";
import { CachedGeocoder } from "\@locations/brim/routing/geocode/cache.js";
import { FixtureGeocoder } from "\@locations/brim/routing/geocode/fixture.js";
import { GoogleGeocoder } from "\@locations/brim/routing/geocode/google.js";
import { chooseGeocoder } from "\@locations/brim/routing/geocode/select.js";
import type { Geocoder } from "\@locations/brim/routing/geocode/types.js";

describe("fixture geocoder", () => {
  const geo = new FixtureGeocoder();

  it("autocompletes gazetteer streets", async () => {
    const hits = await geo.autocomplete("Station Road");
    expect(hits.some((h) => h.label === "Station Road, Crawley")).toBe(true);
    expect(hits[0]?.lat).toBeTypeOf("number");
  });

  it("resolves a fixture place id", async () => {
    const hits = await geo.autocomplete("Deansgate");
    const id = hits[0]?.placeId;
    expect(id).toBeTruthy();
    const resolved = await geo.resolve(id!);
    expect(resolved?.label).toBe("Deansgate, Manchester");
    expect(resolved?.lat).toBeCloseTo(53.4787, 3);
  });

  it("does not invent a street far from the gazetteer", async () => {
    const hit = await geo.reverse(50.0, -5.0);
    expect(hit?.label.startsWith("Pinned location")).toBe(true);
    expect(hit?.label.includes("Crawley")).toBe(false);
  });

  it("names a pin on Station Road, Crawley", async () => {
    const hit = await geo.reverse(51.1139, -0.187);
    expect(hit?.label).toBe("Station Road, Crawley");
  });
});

describe("google geocoder", () => {
  it("sends includedRegionCodes gb and does not echo the key in the body", async () => {
    let body: Record<string, unknown> = {};
    let headers: Headers | undefined;
    const geo = new GoogleGeocoder("secret-key", async (_url, init) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      headers = new Headers(init?.headers);
      return new Response(
        JSON.stringify({
          suggestions: [
            { placePrediction: { placeId: "ChIJ1", text: { text: "Station Road, Crawley, UK" } } },
          ],
        }),
        { status: 200 },
      );
    });
    const hits = await geo.autocomplete("Station Road", { session: "sess-1" });
    expect(body.includedRegionCodes).toEqual(["gb"]);
    expect(body.sessionToken).toBe("sess-1");
    expect(JSON.stringify(body)).not.toContain("secret-key");
    expect(headers?.get("X-Goog-Api-Key")).toBe("secret-key");
    expect(hits).toEqual([{ label: "Station Road, Crawley, UK", placeId: "ChIJ1" }]);
  });

  it("resolves place details to lat/lng", async () => {
    const geo = new GoogleGeocoder("secret-key", async (input) => {
      expect(String(input)).toContain("/places/ChIJ1");
      expect(String(input)).not.toContain("secret-key");
      return new Response(
        JSON.stringify({
          id: "ChIJ1",
          formattedAddress: "Station Road, Crawley, UK",
          location: { latitude: 51.1139, longitude: -0.187 },
        }),
        { status: 200 },
      );
    });
    const hit = await geo.resolve("ChIJ1", { session: "sess-1" });
    expect(hit?.label).toBe("Station Road, Crawley, UK");
    expect(hit?.lat).toBeCloseTo(51.1139, 4);
  });

  it("reverse geocodes a street address", async () => {
    const geo = new GoogleGeocoder("secret-key", async (input) => {
      const url = String(input);
      expect(url).toContain("latlng=51.1139");
      expect(url).toContain("result_type=");
      return new Response(
        JSON.stringify({
          status: "OK",
          results: [
            {
              formatted_address: "Station Road, Crawley, UK",
              geometry: { location: { lat: 51.1139, lng: -0.187 } },
              place_id: "ChIJ1",
            },
          ],
        }),
        { status: 200 },
      );
    });
    const hit = await geo.reverse(51.1139, -0.187);
    expect(hit?.label).toBe("Station Road, Crawley, UK");
  });

  it("falls back when preferred reverse types are empty", async () => {
    let calls = 0;
    const geo = new GoogleGeocoder("secret-key", async (input) => {
      calls += 1;
      const url = String(input);
      expect(url).toContain("latlng=51.1139");
      if (url.includes("result_type=")) {
        return new Response(JSON.stringify({ status: "ZERO_RESULTS", results: [] }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          status: "OK",
          results: [
            {
              formatted_address: "Crawley, UK",
              geometry: { location: { lat: 51.1092, lng: -0.1872 } },
            },
          ],
        }),
        { status: 200 },
      );
    });
    const hit = await geo.reverse(51.1139, -0.187);
    expect(calls).toBe(2);
    expect(hit?.label).toBe("Crawley, UK");
  });

  it("snaps to a road point", async () => {
    const geo = new GoogleGeocoder("secret-key", async () => {
      return new Response(
        JSON.stringify({
          snappedPoints: [{ location: { latitude: 51.114, longitude: -0.1865 } }],
        }),
        { status: 200 },
      );
    });
    const snapped = await geo.snap(51.1139, -0.187);
    expect(snapped.lat).toBeCloseTo(51.114, 3);
  });
});

describe("cached geocoder", () => {
  it("hits the inner geocoder once for the same query", async () => {
    let calls = 0;
    const fixture = new FixtureGeocoder();
    const inner: Geocoder = {
      autocomplete: async (q: string) => {
        calls += 1;
        return fixture.autocomplete(q);
      },
      resolve: (id: string) => fixture.resolve(id),
      reverse: (lat: number, lng: number) => fixture.reverse(lat, lng),
      snap: (lat: number, lng: number) => fixture.snap(lat, lng),
    };
    const spy = new CachedGeocoder(inner, new MemoryCache());
    const a = await spy.autocomplete("Crawley");
    const b = await spy.autocomplete("Crawley");
    expect(a).toEqual(b);
    expect(calls).toBe(1);
  });
});

describe("chooseGeocoder", () => {
  it("uses fixtures when BRIM_FIXTURES is on", async () => {
    const geo = chooseGeocoder({ fixtureMode: true, googleKey: "key", cache: new MemoryCache() });
    const hits = await geo.autocomplete("York");
    expect(hits.some((h) => h.label === "York")).toBe(true);
  });
});
