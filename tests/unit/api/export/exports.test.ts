import { describe, expect, it } from "vitest";
import {
  blurHome,
  guessHomePlace,
  toGeoJson,
  toGpx,
  toVisitsCsv,
  type ExportJourney,
  type ExportVisit,
} from "@locations/api/exports";

const home: ExportVisit = {
  start: "2024-01-01T22:00:00Z",
  end: "2024-01-02T07:00:00Z",
  date: "2024-01-01",
  lat: 51.501234,
  lon: -0.141234,
  durationMinutes: 540,
  semanticType: "Home",
  placeKey: "g:home",
  cluster: "51.5°N 0.0°W",
};
const cafe: ExportVisit = { ...home, start: "2024-01-02T10:00:00Z", lat: 51.52, lon: -0.1, durationMinutes: 30, semanticType: "Unknown", placeKey: "c:51.520,-0.100" };
const walk: ExportJourney = {
  start: "2024-01-02T09:00:00Z",
  end: "2024-01-02T09:40:00Z",
  date: "2024-01-02",
  startLat: home.lat,
  startLon: home.lon,
  endLat: cafe.lat,
  endLon: cafe.lon,
  mode: "walking",
  distanceMeters: 2500,
  path: [
    [51.5013, -0.1413, Date.parse("2024-01-02T09:01:00Z") / 1000],
    [51.51, -0.12, Date.parse("2024-01-02T09:20:00Z") / 1000],
  ],
};

describe("export formats", () => {
  it("writes GPX waypoints and timed tracks", () => {
    const gpx = toGpx({ visits: [home], journeys: [walk] });
    expect(gpx).toContain('<wpt lat="51.501234" lon="-0.141234">');
    expect(gpx).toContain("<name>Home</name>");
    expect(gpx).toContain("<time>2024-01-02T09:20:00.000Z</time>");
    expect(gpx.match(/<trkpt/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("writes GeoJSON in lon, lat order", () => {
    const fc = toGeoJson({ visits: [home], journeys: [walk] });
    expect(fc.features[0].geometry).toEqual({ type: "Point", coordinates: [-0.141234, 51.501234] });
    expect(fc.features[1].properties).toMatchObject({ kind: "journey", mode: "walking", recorded: true });
  });

  it("escapes CSV and blocks spreadsheet formulas", () => {
    const csv = toVisitsCsv([{ ...cafe, semanticType: '=HYPERLINK("x")', cluster: "a,b" }]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain('"a,b"');
    expect(csv.startsWith("date,start,end")).toBe(true);
  });
});

describe("home blur", () => {
  it("guesses home from night stays", () => {
    expect(guessHomePlace([home, cafe])).toEqual({ lat: home.lat, lon: home.lon });
    expect(guessHomePlace([cafe])).toBeNull();
  });

  it("snaps stays and journey ends near home and drops GPS fixes there", () => {
    const out = blurHome({ visits: [home, cafe], journeys: [walk] }, { lat: home.lat, lon: home.lon });
    expect(out.visits[0]).toMatchObject({ lat: 51.5, lon: -0.14, placeKey: null });
    expect(out.visits[1]).toEqual(cafe);
    expect(out.journeys[0]).toMatchObject({ startLat: 51.5, startLon: -0.14, endLat: cafe.lat });
    expect(out.journeys[0].path).toHaveLength(1);
  });
});
