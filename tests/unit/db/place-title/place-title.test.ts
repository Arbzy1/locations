import { describe, expect, it } from "vitest";
import { titleFromGeocode, titleFromPlaceCache, titleWithType } from "@locations/db";

const HERE = { lat: 51.5, lon: -0.12 };

describe("titleFromGeocode", () => {
  it("keeps a building within 40 m", () => {
    const title = titleFromGeocode(HERE.lat, HERE.lon, {
      lat: String(HERE.lat + 0.00008),
      lon: String(HERE.lon),
      name: "The Mill",
      address: { amenity: "The Mill", road: "Mill Lane" },
    });
    expect(title).toEqual({ name: "The Mill", kind: "building" });
  });

  it("drops a building 80 m away and uses the road", () => {
    const title = titleFromGeocode(HERE.lat, HERE.lon, {
      lat: String(HERE.lat + 0.0008),
      lon: String(HERE.lon),
      name: "The Mill",
      address: { amenity: "The Mill", road: "Mill Lane" },
    });
    expect(title).toEqual({ name: "Mill Lane", kind: "road" });
  });

  it("does not keep an amenity when the cached result has no coordinates", () => {
    const title = titleFromPlaceCache(HERE.lat, HERE.lon, {
      address: { amenity: "The Mill", road: "Mill Lane" },
    });
    expect(title).toEqual({ name: "Mill Lane", kind: "road" });
  });

  it("leaves the stay unnamed when there is no road either", () => {
    expect(titleFromGeocode(HERE.lat, HERE.lon, { name: "The Mill" })).toEqual({ name: "", kind: "none" });
  });
});

describe("titleWithType", () => {
  it("prefixes a road with a real place type", () => {
    expect(titleWithType({ name: "Mill Lane", kind: "road" }, "Restaurant")).toBe("Restaurant, Mill Lane");
    expect(titleWithType({ name: "Mill Lane", kind: "road" }, "Home")).toBe("Mill Lane");
    expect(titleWithType({ name: "Mill Lane", kind: "road" }, "Unknown")).toBe("Mill Lane");
    expect(titleWithType({ name: "The Mill", kind: "building" }, "Restaurant")).toBe("The Mill");
  });
});
