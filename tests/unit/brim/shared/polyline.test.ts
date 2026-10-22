import { describe, expect, it } from "vitest";
import { decodePolyline, encodePolyline, parseLatLngString, simplifyRdp } from "\@locations/brim/shared/polyline.js";

const fixtures: Array<{ name: string; points: Array<{ lat: number; lng: number }> }> = [
  { name: "london", points: [{ lat: 51.5, lng: -0.12 }] },
  {
    name: "segment",
    points: [
      { lat: 51.5, lng: -0.12 },
      { lat: 52.5, lng: -1.9 },
    ],
  },
  {
    name: "three",
    points: [
      { lat: 51.5074, lng: -0.1278 },
      { lat: 51.75, lng: -0.5 },
      { lat: 52.0, lng: -1.0 },
    ],
  },
  {
    name: "m25-ish",
    points: [
      { lat: 51.4, lng: -0.3 },
      { lat: 51.45, lng: 0.1 },
      { lat: 51.6, lng: 0.15 },
    ],
  },
  {
    name: "north",
    points: [
      { lat: 55.95, lng: -3.19 },
      { lat: 55.86, lng: -4.25 },
    ],
  },
  {
    name: "west",
    points: [
      { lat: 51.48, lng: -3.18 },
      { lat: 51.62, lng: -3.94 },
    ],
  },
  {
    name: "mid",
    points: [
      { lat: 52.48, lng: -1.9 },
      { lat: 51.45, lng: -2.59 },
    ],
  },
  {
    name: "east",
    points: [
      { lat: 52.63, lng: 1.3 },
      { lat: 52.2, lng: 0.13 },
    ],
  },
  {
    name: "colinear",
    points: [
      { lat: 50, lng: 0 },
      { lat: 50.5, lng: 0.5 },
      { lat: 51, lng: 1 },
    ],
  },
  {
    name: "tiny",
    points: [
      { lat: 51.50001, lng: -0.12001 },
      { lat: 51.50002, lng: -0.12002 },
    ],
  },
];

describe("polyline", () => {
  it("round-trips 10 fixtures against encode/decode", () => {
    expect(fixtures).toHaveLength(10);
    for (const f of fixtures) {
      const encoded = encodePolyline(f.points);
      const decoded = decodePolyline(encoded);
      expect(decoded.length).toBe(f.points.length);
      for (let i = 0; i < f.points.length; i++) {
        expect(decoded[i]?.lat).toBeCloseTo(f.points[i]!.lat, 5);
        expect(decoded[i]?.lng).toBeCloseTo(f.points[i]!.lng, 5);
      }
    }
  });

  it("simplifies with RDP", () => {
    const pts = [
      { lat: 0, lng: 0 },
      { lat: 0.00001, lng: 0.5 },
      { lat: 0, lng: 1 },
    ];
    const simple = simplifyRdp(pts, 0.1);
    expect(simple.length).toBe(2);
  });

  it("parses a lat,lng string", () => {
    expect(parseLatLngString("51.5074,-0.1278")).toEqual({ lat: 51.5074, lng: -0.1278 });
    expect(parseLatLngString("not a point")).toBeUndefined();
  });
});
