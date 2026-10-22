import { findPlaceByLabel } from "@locations/brim/shared";
import { describe, expect, it } from "vitest";
import { composeEstimateRequest, composeVehicleInline, tripPlace } from "@locations/web/lib/brim/estimate/compose-request";
import { formatEstimateMoney } from "@locations/web/lib/brim/estimate/readout";

const crawley = findPlaceByLabel("Crawley")!;
const london = findPlaceByLabel("London")!;

describe("tripPlace", () => {
  it("sends pin coords rather than a bare label", () => {
    expect(tripPlace("Crawley", crawley)).toEqual({
      lat: crawley.lat,
      lng: crawley.lng,
      label: "Crawley",
    });
    expect(tripPlace("Crawley", null)).toBe("Crawley");
  });
});

describe("composeVehicleInline", () => {
  it("sends typed mpg as userEntered on a petrol car", () => {
    const profile = composeVehicleInline({
      propulsion: "petrol",
      vehicleKind: "car",
      vehicleYear: "2021",
      euroStatus: "",
      euroFromDvla: false,
      catalogue: null,
      mpg: "40",
      miKwh: "",
      overrideMpg: "",
      overrideMiKwh: "",
      tank: "45",
      battery: "",
      start: "",
      hasHeatPump: false,
    });
    expect(profile.userEnteredConsumption).toBe(40);
    expect(profile.userEnteredUnit).toBe("mpg");
    expect(profile.tankLitres).toBe(45);
  });

  it("sends typed mi/kWh and start charge on a BEV", () => {
    const profile = composeVehicleInline({
      propulsion: "bev",
      vehicleKind: "car",
      vehicleYear: "2022",
      euroStatus: "",
      euroFromDvla: false,
      catalogue: null,
      mpg: "",
      miKwh: "4",
      overrideMpg: "",
      overrideMiKwh: "",
      tank: "55",
      battery: "64",
      start: "80",
      hasHeatPump: true,
    });
    expect(profile.userEnteredUnit).toBe("mi/kWh");
    expect(profile.userEnteredConsumption).toBe(4);
    expect(profile.batteryKwhUsable).toBe(64);
    expect(profile.startChargePercent).toBe(80);
    expect(profile.hasHeatPump).toBe(true);
    expect(profile.tankLitres).toBeUndefined();
  });
});

describe("composeEstimateRequest", () => {
  it("puts origin, dest, mpg vehicle, and station on the POST body", () => {
    const body = composeEstimateRequest({
      origin: "Crawley",
      originPin: crawley,
      destination: "London",
      destPin: london,
      viaDrafts: [{ id: "1", text: "Birmingham", pin: findPlaceByLabel("Birmingham")! }],
      departsAt: "2026-08-14T08:00",
      propulsion: "petrol",
      vehicleId: "inline",
      stationId: "fixture-station",
      priceStrategy: "cheapest-on-route",
      electricTrip: false,
      chargingLocation: "home",
      hasHeatPump: false,
      start: "",
      homePence: "",
      networkId: "",
      offpeakPence: "",
      offpeakWindow: "",
      evNetworks: [],
      vehicleInline: { kind: "car", propulsion: "petrol", userEnteredConsumption: 40, userEnteredUnit: "mpg" },
    });
    expect(body.origin).toEqual({ lat: crawley.lat, lng: crawley.lng, label: "Crawley" });
    expect(body.destination).toEqual({ lat: london.lat, lng: london.lng, label: "London" });
    expect(body.waypoints).toHaveLength(1);
    expect(body.vehicleInline).toMatchObject({ userEnteredUnit: "mpg" });
    expect(body.stationId).toBe("fixture-station");
    expect(body.priceStrategy).toBe("cheapest-on-route");
    expect(body.vehicleId).toBeUndefined();
  });

  it("sends a home EV tariff and start charge", () => {
    const body = composeEstimateRequest({
      origin: "Crawley",
      originPin: crawley,
      destination: "London",
      destPin: london,
      viaDrafts: [],
      departsAt: "2026-08-14T08:00",
      propulsion: "bev",
      vehicleId: "inline",
      stationId: "ignore-me",
      priceStrategy: "national-median",
      electricTrip: true,
      chargingLocation: "home",
      hasHeatPump: true,
      start: "80",
      homePence: "7.5",
      networkId: "",
      offpeakPence: "7",
      offpeakWindow: "00:30-04:30",
      evNetworks: [],
      vehicleInline: { kind: "car", propulsion: "bev" },
    });
    expect(body.stationId).toBeUndefined();
    expect(body.priceStrategy).toBe("user-tariff");
    expect(body.pricePence).toBe(7.5);
    expect(body.startChargePercent).toBe(80);
    expect(body.chargingLocation).toBe("home");
    expect(body.offpeakWindow).toBe("00:30-04:30");
  });
});

describe("formatEstimateMoney", () => {
  it("uses API pence and never multiplies a local ppl", () => {
    expect(formatEstimateMoney({ point: 1420, low: 1300, high: 1600 })).toEqual({
      pounds: 14.2,
      band: "£13–£16",
    });
  });
});
