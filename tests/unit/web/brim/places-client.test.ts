import { describe, expect, it, vi } from "vitest";
import {
  fetchPlaceSuggestions,
  resolvePlaceSuggestion,
  reversePlace,
} from "@locations/web/lib/brim/places-client";

describe("resolvePlaceSuggestion", () => {
  it("uses coords on the suggestion without a network call", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const place = await resolvePlaceSuggestion(
      { label: "Station Road, Crawley", lat: 51.1139, lng: -0.187, placeId: "fixture:station" },
      "sess",
    );
    expect(place).toEqual({
      label: "Station Road, Crawley",
      lat: 51.1139,
      lng: -0.187,
      placeId: "fixture:station",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("fetchPlaceSuggestions", () => {
  it("passes the session on the query string", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toContain("/api/brim/places?q=Station");
        expect(String(input)).toContain("session=sess-1");
        return new Response(
          JSON.stringify({
            places: [{ label: "Station Road, Crawley", lat: 51.1139, lng: -0.187 }],
          }),
          { status: 200 },
        );
      }),
    );
    const hits = await fetchPlaceSuggestions("Station", "sess-1");
    expect(hits[0]?.lat).toBeCloseTo(51.1139, 3);
    vi.unstubAllGlobals();
  });

  it("passes map-center bias on the query string", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        expect(url).toContain("lat=51.11");
        expect(url).toContain("lng=-0.18");
        return new Response(JSON.stringify({ places: [] }), { status: 200 });
      }),
    );
    await fetchPlaceSuggestions("Station", "sess-1", { lat: 51.11, lng: -0.18 });
    vi.unstubAllGlobals();
  });
});

describe("reversePlace", () => {
  it("returns the snapped label and coords", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            place: { label: "Station Road, Crawley", lat: 51.114, lng: -0.1865 },
          }),
          { status: 200 },
        );
      }),
    );
    const place = await reversePlace(51.1139, -0.187);
    expect(place.label).toBe("Station Road, Crawley");
    expect(place.lat).toBeCloseTo(51.114, 3);
    vi.unstubAllGlobals();
  });
});
