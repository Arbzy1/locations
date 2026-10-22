import { describe, expect, it } from "vitest";
import { distanceMeters } from "\@locations/brim/shared/places.js";
import { canonicalBrand } from "\@locations/brim/shared/fuel-finder/brands.js";
import { openingHoursSummary, titleCaseAddress } from "\@locations/brim/shared/fuel-finder/display.js";
import { mapFuelFinderGrade } from "\@locations/brim/shared/fuel-finder/grades.js";
import { DEDUPE_METERS, normaliseFuelFinder } from "\@locations/brim/shared/fuel-finder/normalise.js";
import { parsePriceToPpl, pplToTenths } from "\@locations/brim/shared/fuel-finder/price.js";
import type { FuelFinderPfs } from "\@locations/brim/shared/fuel-finder/types.js";

const NOW = "2026-08-16T12:00:00Z";

function site(
  id: string,
  brand: string,
  lat: number,
  lng: number,
  extra: Partial<FuelFinderPfs> = {},
): FuelFinderPfs {
  return {
    node_id: id,
    trading_name: brand,
    brand_name: brand,
    permanent_closure: false,
    location: { latitude: lat, longitude: lng, address_line_1: "LONDON ROAD", postcode: "RH10 1AA" },
    ...extra,
  };
}

describe("parsePriceToPpl", () => {
  it("maps the dirty corpus onto the same tenths-of-a-penny integer", () => {
    expect(pplToTenths(parsePriceToPpl(1.339)!)).toBe(1339);
    expect(pplToTenths(parsePriceToPpl(133.9)!)).toBe(1339);
    expect(pplToTenths(parsePriceToPpl(1339)!)).toBe(1339);
    expect(pplToTenths(parsePriceToPpl("0120.0000")!)).toBe(1200);
  });

  it("treats values below 2 as pounds", () => {
    expect(parsePriceToPpl(1.5)).toBe(150);
    expect(parsePriceToPpl("0.80")).toBe(80);
  });

  it("skips null and out-of-range values", () => {
    expect(parsePriceToPpl(null)).toBeUndefined();
    expect(parsePriceToPpl(12)).toBeUndefined();
    expect(parsePriceToPpl(400)).toBeUndefined();
    expect(parsePriceToPpl(50)).toBeUndefined();
  });
});

describe("mapFuelFinderGrade", () => {
  it("maps CMA types onto the SQL CHECK grades and skips the rest", () => {
    expect(mapFuelFinderGrade("E10")).toBe("E10");
    expect(mapFuelFinderGrade("E5")).toBe("E5");
    expect(mapFuelFinderGrade("B7_STANDARD")).toBe("B7");
    expect(mapFuelFinderGrade("B7_PREMIUM")).toBe("SDV");
    expect(mapFuelFinderGrade("B10")).toBeUndefined();
    expect(mapFuelFinderGrade("HVO")).toBeUndefined();
    expect(mapFuelFinderGrade("UNKNOWN")).toBeUndefined();
  });
});

describe("canonicalBrand", () => {
  it("collapses Shell aliases", () => {
    expect(canonicalBrand("SHELL")).toBe("Shell");
    expect(canonicalBrand("Shell")).toBe("Shell");
    expect(canonicalBrand("Shell UK Oil Products Ltd")).toBe("Shell");
  });
});

describe("titleCaseAddress", () => {
  it("title-cases on display without touching postcode letters", () => {
    expect(titleCaseAddress("LONDON ROAD, CRAWLEY, RH10 1AA")).toBe("London Road, Crawley, RH10 1AA");
  });
});

describe("openingHoursSummary", () => {
  it("formats 24-hour and typical hours without filtering", () => {
    expect(
      openingHoursSummary({ usual_days: { monday: { open: "00:00:00", close: "00:00:00", is_24_hours: true } } }),
    ).toBe("Open 24 hours");
    expect(
      openingHoursSummary({ usual_days: { monday: { open: "06:00:00", close: "22:00:00", is_24_hours: false } } }),
    ).toBe("Typically 06:00-22:00");
  });
});

describe("normaliseFuelFinder", () => {
  it("keeps a station when a grade is null and skips that grade", () => {
    const result = normaliseFuelFinder({
      pfs: [site("a", "BP", 51.11, -0.18)],
      prices: [
        {
          node_id: "a",
          fuel_prices: [
            { price: null, fuel_type: "E10", price_last_updated: null },
            { price: 134.5, fuel_type: "B7_STANDARD", price_last_updated: "2026-08-16T11:00:00" },
          ],
        },
      ],
      nowIso: NOW,
    });
    expect(result.stations).toHaveLength(1);
    expect(result.prices).toHaveLength(1);
    expect(result.prices[0]?.grade).toBe("B7");
    expect(result.skipped.some((s) => s.reason === "price-null")).toBe(true);
  });

  it("marks permanent closures and 14-day silence as stale", () => {
    const result = normaliseFuelFinder({
      pfs: [
        site("closed", "BP", 51.11, -0.18, { permanent_closure: true }),
        site("old", "Tesco", 51.12, -0.18),
      ],
      prices: [
        {
          node_id: "old",
          fuel_prices: [{ price: 130, fuel_type: "E10", price_last_updated: "2026-07-01T00:00:00" }],
        },
      ],
      nowIso: NOW,
    });
    expect(result.stations.find((s) => s.id === "closed")?.isStale).toBe(true);
    expect(result.stations.find((s) => s.id === "old")?.isStale).toBe(true);
  });

  it("dedupes the same canonical brand within 50 m and keeps node_id as the key", () => {
    const a = site("keep", "SHELL", 51.11, -0.18);
    const b = site("drop", "Shell UK Oil Products Ltd", 51.1102, -0.18);
    expect(distanceMeters({ lat: 51.11, lng: -0.18 }, { lat: 51.1102, lng: -0.18 })).toBeLessThan(DEDUPE_METERS);
    const result = normaliseFuelFinder({
      pfs: [a, b],
      prices: [
        {
          node_id: "drop",
          fuel_prices: [{ price: 130, fuel_type: "E10", price_last_updated: "2026-08-16T11:00:00" }],
        },
      ],
      nowIso: NOW,
    });
    expect(result.stations.map((s) => s.id)).toEqual(["keep"]);
    expect(result.prices[0]?.stationId).toBe("keep");
    expect(result.skipped.some((s) => s.reason === "duplicate-site" && s.nodeId === "drop")).toBe(true);
  });

  it("does not invent a price for a silent site", () => {
    const result = normaliseFuelFinder({
      pfs: [site("silent", "Gulf", 51.11, -0.18)],
      prices: [{ node_id: "silent", fuel_prices: [] }],
      nowIso: NOW,
    });
    expect(result.stations).toHaveLength(1);
    expect(result.prices).toHaveLength(0);
  });
});

describe("recorded fixture corpus", () => {
  it("normalises the recorded batch without secrets", async () => {
    const { FUEL_FINDER_FIXTURES } = await import("@locations/brim/shared/fixtures/fuel-finder.js");
    const result = normaliseFuelFinder({
      pfs: FUEL_FINDER_FIXTURES.pfs,
      prices: FUEL_FINDER_FIXTURES.prices,
      nowIso: FUEL_FINDER_FIXTURES.nowIso,
    });
    expect(result.stations.some((s) => s.id === "ff_shell_crawley")).toBe(true);
    expect(result.stations.find((s) => s.id === "ff_gulf_crawley_silent")).toBeTruthy();
    expect(result.prices.some((p) => p.stationId === "ff_gulf_crawley_silent")).toBe(false);
    expect(result.prices.find((p) => p.stationId === "ff_shell_crawley" && p.grade === "E10")?.priceTenthsPence).toBe(
      1299,
    );
    expect(result.skipped.some((s) => s.fuelType === "B10")).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/client_secret|access_token/i);
  });
});
