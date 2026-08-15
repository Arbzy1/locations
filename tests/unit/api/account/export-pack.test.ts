import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  buildExportReadmeHtml,
  buildGdprPackZip,
  escapeHtml,
  rowsToJsonl,
} from "@locations/api/export-pack";

const account = {
  tenant: "user-a",
  exportedAt: "2026-08-15T00:00:00.000Z",
  overview: {
    total_visits: 2,
    total_activities: 1,
    date_range: ["2024-01-01", "2024-01-02"] as [string, string],
    days_with_data: 2,
    unique_places: 1,
  },
  sources: [{ id: "s1", label: "personal@example.com", visitCount: 2, activityCount: 1 }],
  settings: { distanceUnit: "mi" },
  labels: [],
};

describe("export pack helpers", () => {
  it("escapes HTML in labels", () => {
    expect(escapeHtml(`<script>alert("x")</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
  });

  it("writes jsonl lines", () => {
    expect(rowsToJsonl([{ id: 1 }, { id: 2 }])).toBe('{"id":1}\n{"id":2}\n');
    expect(rowsToJsonl([])).toBe("");
  });

  it("builds an HTML summary without coordinates or map keys", () => {
    const html = buildExportReadmeHtml({
      ...account,
      sources: [{ id: "s1", label: "<Home>", visitCount: 1, activityCount: 0 }],
    });
    expect(html).toContain("&lt;Home&gt;");
    expect(html).not.toContain("<Home>");
    expect(html).not.toContain("leaflet");
    expect(html).not.toContain("maptiler");
    expect(html).not.toContain("51.5");
    expect(html).toContain("no map tiles");
  });

  it("zips account json, jsonl, and readme", () => {
    const zip = buildGdprPackZip({
      account,
      visits: [{ id: 1, lat: 51.5, lon: -0.1 }],
      activities: [{ id: 9, mode: "walking" }],
    });
    const names = Object.keys(unzipSync(zip));
    expect(names.sort()).toEqual(["README.html", "account.json", "activities.jsonl", "visits.jsonl"]);
  });
});
