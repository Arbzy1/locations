import { describe, expect, it } from "vitest";
import { isZipMagic } from "./unzip-takeout";
import { zipSync } from "fflate";
import { extractTimelineJsonFromZip } from "./unzip-takeout";

describe("isZipMagic", () => {
  it("detects PK header", () => {
    const buf = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0]).buffer;
    expect(isZipMagic(buf)).toBe(true);
  });

  it("rejects json", () => {
    const buf = new TextEncoder().encode("[]").buffer;
    expect(isZipMagic(buf)).toBe(false);
  });
});

describe("extractTimelineJsonFromZip", () => {
  it("picks Timeline.json from a zip", async () => {
    const zipped = zipSync({
      "Takeout/Location History/Timeline.json": new TextEncoder().encode(
        JSON.stringify([{ startTime: "2024-01-01T00:00:00Z" }]),
      ),
    });
    const text = await extractTimelineJsonFromZip(zipped);
    expect(text).toContain("startTime");
  });
});
