import type { FuelFinderPfs, FuelFinderPriceRow } from "../fuel-finder/types.js";

export const FUEL_FINDER_FIXTURE_NOW = "2026-08-16T12:00:00Z";

/** Recorded-looking PFS + prices batch. Public-looking ids, no secrets. */
export const FUEL_FINDER_PFS_FIXTURES: FuelFinderPfs[] = [
  {
    node_id: "ff_shell_crawley",
    trading_name: "SHELL CRAWLEY",
    brand_name: "SHELL",
    permanent_closure: false,
    location: {
      address_line_1: "LONDON ROAD, CRAWLEY",
      city: "CRAWLEY",
      postcode: "RH10 1AA",
      latitude: "51.1100",
      longitude: "-0.1860",
    },
    opening_times: { usual_days: { monday: { open: "00:00:00", close: "00:00:00", is_24_hours: true } } },
    fuel_types: ["E10", "E5", "B7_STANDARD", "B10"],
  },
  {
    node_id: "ff_bp_crawley",
    trading_name: "BP Connect Crawley",
    brand_name: "BP",
    permanent_closure: false,
    location: {
      address_line_1: "HIGH STREET, CRAWLEY",
      city: "CRAWLEY",
      postcode: "RH10 1AB",
      latitude: 51.108,
      longitude: -0.189,
    },
    fuel_types: ["E10", "B7_STANDARD", "B7_PREMIUM"],
  },
  {
    node_id: "ff_tesco_london",
    trading_name: "Tesco Extra",
    brand_name: "Tesco Extra",
    permanent_closure: false,
    location: {
      address_line_1: "VICTORIA STREET, LONDON",
      city: "LONDON",
      postcode: "SW1E 5ND",
      latitude: "51.5074",
      longitude: "-0.1278",
    },
    fuel_types: ["E10", "B7_STANDARD"],
  },
  {
    node_id: "ff_asda_horley",
    trading_name: "Asda Horley",
    brand_name: "Asda",
    permanent_closure: false,
    location: {
      address_line_1: "REIGATE ROAD, HORLEY",
      city: "HORLEY",
      postcode: "RH6 0AT",
      latitude: "51.3083",
      longitude: "-0.1575",
    },
    opening_times: { usual_days: { monday: { open: "06:00:00", close: "22:00:00", is_24_hours: false } } },
    fuel_types: ["E10", "B7_STANDARD"],
  },
  {
    node_id: "ff_gulf_crawley_silent",
    trading_name: "GULF CRAWLEY",
    brand_name: "Gulf",
    permanent_closure: false,
    location: {
      address_line_1: "STATION ROAD, CRAWLEY",
      city: "CRAWLEY",
      postcode: "RH10 1AC",
      latitude: "51.1120",
      longitude: "-0.1850",
    },
    fuel_types: ["E10"],
  },
  {
    node_id: "ff_shell_york_stale",
    trading_name: "Shell York",
    brand_name: "Shell UK Oil Products Ltd",
    permanent_closure: false,
    location: {
      address_line_1: "BLAKE STREET, YORK",
      city: "YORK",
      postcode: "YO1 8QG",
      latitude: "53.9600",
      longitude: "-1.0873",
    },
    fuel_types: ["E10"],
  },
  {
    node_id: "ff_closed_crawley",
    trading_name: "Closed Forecourt",
    brand_name: "Independent",
    permanent_closure: true,
    location: {
      address_line_1: "OLD MILL, CRAWLEY",
      city: "CRAWLEY",
      postcode: "RH10 1AD",
      latitude: "51.1090",
      longitude: "-0.1900",
    },
    fuel_types: ["E10"],
  },
];

export const FUEL_FINDER_PRICE_FIXTURES: FuelFinderPriceRow[] = [
  {
    node_id: "ff_shell_crawley",
    trading_name: "SHELL CRAWLEY",
    fuel_prices: [
      { price: "0129.9000", fuel_type: "E10", price_last_updated: "2026-08-16T11:48:00" },
      { price: 141.2, fuel_type: "B7_STANDARD", price_last_updated: "2026-08-16T11:48:00" },
      { price: "0139.9000", fuel_type: "E5", price_last_updated: "2026-08-16T11:40:00" },
      { price: "0120.0000", fuel_type: "B10", price_last_updated: "2026-08-16T11:48:00" },
      { price: null, fuel_type: "HVO", price_last_updated: null },
    ],
  },
  {
    node_id: "ff_bp_crawley",
    trading_name: "BP Connect Crawley",
    fuel_prices: [
      { price: 134.5, fuel_type: "E10", price_last_updated: "2026-08-16T11:30:00" },
      { price: 145.0, fuel_type: "B7_STANDARD", price_last_updated: "2026-08-16T11:30:00" },
      { price: 151.0, fuel_type: "B7_PREMIUM", price_last_updated: "2026-08-16T11:30:00" },
    ],
  },
  {
    node_id: "ff_tesco_london",
    trading_name: "Tesco Extra",
    fuel_prices: [
      { price: 142.0, fuel_type: "E10", price_last_updated: "2026-08-16T10:00:00" },
      { price: 148.5, fuel_type: "B7_STANDARD", price_last_updated: "2026-08-16T10:00:00" },
    ],
  },
  {
    node_id: "ff_asda_horley",
    trading_name: "Asda Horley",
    fuel_prices: [
      { price: 125.0, fuel_type: "E10", price_last_updated: "2026-08-16T11:00:00" },
      { price: 132.0, fuel_type: "B7_STANDARD", price_last_updated: "2026-08-16T11:00:00" },
    ],
  },
  {
    node_id: "ff_gulf_crawley_silent",
    trading_name: "GULF CRAWLEY",
    fuel_prices: [
      { price: null, fuel_type: "E10", price_last_updated: null },
    ],
  },
  {
    node_id: "ff_shell_york_stale",
    trading_name: "Shell York",
    fuel_prices: [
      { price: 131.0, fuel_type: "E10", price_last_updated: "2026-07-01T09:00:00" },
    ],
  },
  {
    node_id: "ff_closed_crawley",
    trading_name: "Closed Forecourt",
    fuel_prices: [
      { price: 199.0, fuel_type: "E10", price_last_updated: "2026-08-16T08:00:00" },
    ],
  },
];

export const FUEL_FINDER_FIXTURES = {
  pfs: FUEL_FINDER_PFS_FIXTURES,
  prices: FUEL_FINDER_PRICE_FIXTURES,
  nowIso: FUEL_FINDER_FIXTURE_NOW,
};
