import { describe, expect, it } from "vitest";
import {
  FILL_HASSLE_PENCE,
  litresToFill,
  pencePerKmFromConsumption,
  rankCheapestFill,
} from "\@locations/brim/engine/fill/rank.js";

const line = [
  { lat: 51.1092, lng: -0.1872 },
  { lat: 51.3083, lng: -0.1575 },
  { lat: 51.5074, lng: -0.1278 },
];

const litres = litresToFill(55);
const pencePerKm = pencePerKmFromConsumption(7, 132.2);

describe("litresToFill", () => {
  it("defaults remaining to 25% of a 55 L tank", () => {
    expect(litresToFill()).toBeCloseTo(41.25, 5);
    expect(litresToFill(55)).toBeCloseTo(41.25, 5);
    expect(litresToFill(55, 10)).toBe(45);
  });
});

describe("rankCheapestFill", () => {
  it("ranks a cheap close station above the home-area fill", () => {
    const result = rankCheapestFill({
      candidates: [{ stationId: "asda", lat: 51.3083, lng: -0.1575, pencePerLitre: 125 }],
      polyline: line,
      litresToFill: litres,
      pencePerKm,
      baselinePencePerLitre: 132.2,
    });
    expect(result.stations).toHaveLength(1);
    expect(result.stations[0]?.stationId).toBe("asda");
    expect(result.stations[0]?.savingPence).toBeGreaterThanOrEqual(100);
    expect(result.stations[0]?.detourPence).toBeCloseTo(FILL_HASSLE_PENCE, 0);
  });

  it("drops a cheap station whose detour wipes the saving", () => {
    const result = rankCheapestFill({
      candidates: [{ stationId: "far", lat: 51.3083, lng: 0.0, pencePerLitre: 125 }],
      polyline: line,
      litresToFill: litres,
      pencePerKm,
      baselinePencePerLitre: 132.2,
      maxPerpendicularMeters: 50_000,
    });
    expect(result.stations).toHaveLength(0);
  });

  it("suppresses savings under 100 pence", () => {
    const result = rankCheapestFill({
      candidates: [{ stationId: "shell", lat: 51.1092, lng: -0.1872, pencePerLitre: 129.9 }],
      polyline: line,
      litresToFill: litres,
      pencePerKm,
      baselinePencePerLitre: 132.2,
    });
    expect(result.stations).toHaveLength(0);
  });

  it("dedupes the same station id", () => {
    const result = rankCheapestFill({
      candidates: [
        { stationId: "asda", lat: 51.3083, lng: -0.1575, pencePerLitre: 125 },
        { stationId: "asda", lat: 51.3083, lng: -0.1575, pencePerLitre: 120 },
      ],
      polyline: line,
      litresToFill: litres,
      pencePerKm,
      baselinePencePerLitre: 132.2,
    });
    expect(result.stations).toHaveLength(1);
    expect(result.stations[0]?.fillPence).toBeCloseTo(litres * 125, 5);
  });
});
