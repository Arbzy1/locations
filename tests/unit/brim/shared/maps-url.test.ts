import { describe, expect, it } from "vitest";
import { isMapsShortUrl, parseMapsUrl } from "\@locations/brim/shared/maps-url.js";

const valid: Array<{
  url: string;
  origin: string;
  destination: string;
  mode?: string;
  waypoints?: string[];
}> = [
  {
    url: "https://www.google.com/maps/dir/Crawley/Manchester/",
    origin: "Crawley",
    destination: "Manchester",
  },
  {
    url: "https://www.google.com/maps/dir/London/Birmingham/@52.4,-1.5,7z/data=!3e0",
    origin: "London",
    destination: "Birmingham",
    mode: "drive",
  },
  {
    url: "https://www.google.com/maps/dir/51.5074,-0.1278/53.4808,-2.2426/",
    origin: "51.5074,-0.1278",
    destination: "53.4808,-2.2426",
  },
  {
    url: "https://maps.google.com/maps/dir/Edinburgh/Glasgow/",
    origin: "Edinburgh",
    destination: "Glasgow",
  },
  {
    url: "https://www.google.co.uk/maps/dir/Bristol/Bath/",
    origin: "Bristol",
    destination: "Bath",
  },
  {
    url: "https://www.google.com/maps/dir/Leeds/Sheffield/Manchester/",
    origin: "Leeds",
    destination: "Manchester",
  },
  {
    url: "https://www.google.com/maps/dir/Newcastle%20upon%20Tyne/York/",
    origin: "Newcastle upon Tyne",
    destination: "York",
  },
  {
    url: "https://www.google.com/maps/dir/Oxford+Station/Cambridge/",
    origin: "Oxford Station",
    destination: "Cambridge",
  },
  {
    url: "https://www.google.com/maps/dir/GWCX%2BF7+London/Manchester/",
    origin: "GWCX+F7 London",
    destination: "Manchester",
  },
  {
    url: "https://www.google.com/maps/dir/Cardiff/Swansea/data=!4m2!4m1!3e3",
    origin: "Cardiff",
    destination: "Swansea",
    mode: "transit",
  },
  {
    url: "https://www.google.com/maps/dir/Brighton/Portsmouth/@50.8,-0.8,9z",
    origin: "Brighton",
    destination: "Portsmouth",
  },
  {
    url: "https://www.google.com/maps/dir/Belfast/Dublin/",
    origin: "Belfast",
    destination: "Dublin",
  },
  {
    url: "https://maps.google.co.uk/maps/dir/Crawley/London/",
    origin: "Crawley",
    destination: "London",
  },
  {
    url: "https://www.google.com/maps/dir/?api=1&origin=Crawley&destination=London&travelmode=driving",
    origin: "Crawley",
    destination: "London",
    mode: "drive",
  },
  {
    url: "https://www.google.co.uk/maps/dir/?api=1&origin=Leeds&destination=Manchester&waypoints=Sheffield%7CBarnsley",
    origin: "Leeds",
    destination: "Manchester",
    waypoints: ["Sheffield", "Barnsley"],
  },
  {
    url: "https://maps.google.com/maps/dir/?api=1&origin=Bristol&destination=Bath&waypoints=Keynsham/Saltford",
    origin: "Bristol",
    destination: "Bath",
    waypoints: ["Keynsham", "Saltford"],
  },
  {
    url: "https://maps.apple.com/?saddr=Crawley&daddr=London",
    origin: "Crawley",
    destination: "London",
  },
  {
    url: "https://maps.apple.com/?saddr=Leeds&daddr=Sheffield%7CManchester&dirflg=d",
    origin: "Leeds",
    destination: "Manchester",
    waypoints: ["Sheffield"],
    mode: "drive",
  },
  {
    url: "https://www.bing.com/maps?rtp=adr.Crawley~adr.London",
    origin: "Crawley",
    destination: "London",
  },
  {
    url: "https://bing.com/maps/directions?rtp=adr.Leeds~adr.Sheffield~adr.Manchester",
    origin: "Leeds",
    destination: "Manchester",
    waypoints: ["Sheffield"],
  },
];

const malformed = [
  "not a url",
  "https://example.com/maps/dir/a/b",
  "https://www.google.com/maps/place/London/",
  "https://maps.app.goo.gl/brimtest",
];

describe("parseMapsUrl", () => {
  it("parses a corpus of real directions URLs", () => {
    expect(valid.length + malformed.length).toBeGreaterThanOrEqual(15);
    for (const row of valid) {
      const result = parseMapsUrl(row.url);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.origin).toBe(row.origin);
        expect(result.destination).toBe(row.destination);
        if (row.mode) expect(result.travelMode).toBe(row.mode);
        if (row.waypoints) expect(result.waypoints).toEqual(row.waypoints);
      }
    }
  });

  it("returns a typed failure for malformed input and never throws", () => {
    for (const url of malformed) {
      expect(() => parseMapsUrl(url)).not.toThrow();
      const result = parseMapsUrl(url);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason.length).toBeGreaterThan(10);
    }
  });

  it("fails short Maps links with a reason that asks for the full URL", () => {
    const result = parseMapsUrl("https://maps.app.goo.gl/brimtest");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/shorten/i);
  });
});

describe("isMapsShortUrl", () => {
  it("recognises Google Maps shorteners only", () => {
    expect(isMapsShortUrl("https://maps.app.goo.gl/brimtest")).toBe(true);
    expect(isMapsShortUrl("https://goo.gl/maps/brimtest")).toBe(true);
    expect(isMapsShortUrl("https://www.google.com/maps/dir/Crawley/London/")).toBe(false);
    expect(isMapsShortUrl("https://goo.gl/notmaps")).toBe(false);
  });
});
