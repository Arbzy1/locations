import { describe, expect, it } from "vitest";
import { extractTimelineJsonFromZip, isZipMagic } from "@locations/api/unzip-takeout";
import { sniffTimelineJson } from "@locations/api/upload-sniff";
import { zipSync } from "fflate";

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
    const result = await extractTimelineJsonFromZip(zipped);
    expect(result.text).toContain("startTime");
    expect(result.chosenPath).toMatch(/Timeline\.json$/i);
    expect(result.candidates.some((n) => /Timeline\.json$/i.test(n))).toBe(true);
    const sniffed = sniffTimelineJson(new TextEncoder().encode(result.text));
    expect(sniffed.ok).toBe(true);
  });

  it("prefers Timeline.json over Records.json", async () => {
    const zipped = zipSync({
      "Takeout/Location History/Records.json": new TextEncoder().encode('{"locations":[]}'),
      "Takeout/Location History/Timeline.json": new TextEncoder().encode(
        JSON.stringify([{ startTime: "2024-02-01T00:00:00Z" }]),
      ),
    });
    const result = await extractTimelineJsonFromZip(zipped);
    expect(result.chosenPath).toMatch(/Timeline\.json$/i);
    expect(result.text).toContain("2024-02-01");
  });

  it("explains a Settings-only zip", async () => {
    const zipped = zipSync({
      "Takeout/Location History/Settings.json": new TextEncoder().encode(
        JSON.stringify({ timelineEnabled: true }),
      ),
    });
    await expect(extractTimelineJsonFromZip(zipped)).rejects.toThrow(/Found Settings\.json/);
    await expect(extractTimelineJsonFromZip(zipped)).rejects.toThrow(
      /Zip should include Timeline\.json or Records\.json/,
    );
  });

  it("merges every Semantic Location History month", async () => {
    const month = (ts: string) =>
      new TextEncoder().encode(
        JSON.stringify({
          timelineObjects: [
            {
              placeVisit: {
                location: { latitudeE7: 515000000, longitudeE7: -1000000 },
                duration: { startTimestamp: `${ts}T08:00:00Z`, endTimestamp: `${ts}T09:00:00Z` },
              },
            },
          ],
        }),
      );
    const zipped = zipSync({
      "Takeout/Location History/Semantic Location History/2019/2019_JANUARY.json": month("2019-01-05"),
      "Takeout/Location History/Semantic Location History/2019/2019_FEBRUARY.json": month("2019-02-05"),
      "Takeout/Location History/Settings.json": new TextEncoder().encode("{}"),
    });
    const result = await extractTimelineJsonFromZip(zipped);
    expect(result.chosenPath).toBe("Semantic Location History (2 months)");
    const merged = JSON.parse(result.text) as { timelineObjects: unknown[] };
    expect(merged.timelineObjects).toHaveLength(2);
    expect(result.text).toContain("2019-01-05");
    expect(result.text).toContain("2019-02-05");
  });
});
