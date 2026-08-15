import { describe, expect, it } from "vitest";
import {
  cspSourcesForHosts,
  extraCspHostsFromEnv,
  parseCustomTileHosts,
  sanitizeBookmarks,
  validateTileTemplate,
} from "@locations/api/map-tiles";

describe("map tiles allowlist", () => {
  it("parses comma-separated hosts", () => {
    expect(parseCustomTileHosts(" tiles.example.com, *.cdn.example.com ")).toEqual([
      "tiles.example.com",
      "*.cdn.example.com",
    ]);
  });

  it("accepts https XYZ templates on the allowlist", () => {
    const ok = validateTileTemplate(
      "https://tiles.example.com/{z}/{x}/{y}.png",
      ["tiles.example.com"],
    );
    expect(ok).toEqual({ ok: true, url: "https://tiles.example.com/{z}/{x}/{y}.png" });
  });

  it("rejects http, credentials, unknown hosts, and missing tokens", () => {
    const hosts = ["tiles.example.com"];
    expect(validateTileTemplate("http://tiles.example.com/{z}/{x}/{y}.png", hosts).ok).toBe(false);
    expect(
      validateTileTemplate("https://user:pass@tiles.example.com/{z}/{x}/{y}.png", hosts).ok,
    ).toBe(false);
    expect(validateTileTemplate("https://evil.test/{z}/{x}/{y}.png", hosts).ok).toBe(false);
    expect(validateTileTemplate("https://tiles.example.com/tiles.png", hosts).ok).toBe(false);
    expect(validateTileTemplate("https://tiles.example.com/{z}/{x}/{y}.png", []).ok).toBe(false);
  });

  it("adds style and custom hosts to CSP extras", () => {
    const hosts = extraCspHostsFromEnv({
      MAP_CUSTOM_TILE_HOSTS: "tiles.example.com",
      MAP_STYLE_DARK_URL: "https://api.maptiler.com/maps/dark/style.json?key=x",
    });
    expect(hosts).toContain("tiles.example.com");
    expect(hosts).toContain("api.maptiler.com");
    expect(cspSourcesForHosts(hosts)).toContain("https://tiles.example.com");
  });

  it("caps bookmarks and rejects invalid cameras", () => {
    const one = sanitizeBookmarks([
      { id: "a", name: "Home", lng: -0.1, lat: 51.5, zoom: 12, pitch: 0, bearing: 0 },
    ]);
    expect(Array.isArray(one) && one[0].name).toBe("Home");
    expect(sanitizeBookmarks({ id: "x" })).toEqual({ error: "Bookmarks must be a list" });
    expect(
      sanitizeBookmarks(
        Array.from({ length: 21 }, (_, i) => ({
          id: `id-${i}`,
          name: "V",
          lng: 0,
          lat: 0,
          zoom: 1,
          pitch: 0,
          bearing: 0,
        })),
      ),
    ).toEqual({ error: "At most 20 saved views" });
  });
});
