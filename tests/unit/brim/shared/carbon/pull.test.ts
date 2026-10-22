import { describe, expect, it } from "vitest";
import { persistCarbonIntensity } from "\@locations/brim/shared/carbon/ingest.js";
import { pullCarbonIntensity } from "\@locations/brim/shared/carbon/pull.js";

describe("pullCarbonIntensity", () => {
  it("uses injected fetch and parses periods", async () => {
    const fetchFn: typeof fetch = async (input) => {
      expect(String(input)).toContain("https://api.carbonintensity.org.uk/intensity/");
      return new Response(
        JSON.stringify({
          data: [
            {
              from: "2026-08-16T12:00Z",
              to: "2026-08-16T12:30Z",
              intensity: { forecast: 190, actual: 188 },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    const pulled = await pullCarbonIntensity({ fetch: fetchFn, nowIso: "2026-08-16T12:00:00Z" });
    expect(pulled.periods).toHaveLength(1);
    expect(pulled.periods[0]?.intensityGPerKwh).toBe(188);
  });
});

describe("persistCarbonIntensity", () => {
  it("upserts rows and the watermark", async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    await persistCarbonIntensity(
      async (sql, params) => {
        calls.push({ sql, params });
      },
      [
        {
          region: "GB",
          intensityGPerKwh: 190,
          validFrom: "2026-08-16T12:00:00.000Z",
          validTo: "2026-08-16T12:30:00.000Z",
          source: "forecast",
        },
      ],
      "2026-08-16T12:00:00Z",
    );
    expect(calls).toHaveLength(2);
    expect(calls[0]?.params).toEqual(["GB", 190, "2026-08-16T12:00:00.000Z", "2026-08-16T12:30:00.000Z"]);
    expect(calls[1]?.params[0]).toBe("carbon-intensity");
  });
});
