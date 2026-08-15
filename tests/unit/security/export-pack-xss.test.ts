import { describe, expect, it } from "vitest";
import { buildExportReadmeHtml, escapeHtml } from "@locations/api/export-pack";

describe("export pack XSS escape", () => {
  it("escapes source labels in the HTML summary", () => {
    expect(escapeHtml(`<img onerror="alert(1)">`)).toContain("&lt;img");
    const html = buildExportReadmeHtml({
      tenant: "user-a",
      exportedAt: "2026-08-15T00:00:00.000Z",
      overview: {
        total_visits: 1,
        total_activities: 0,
        date_range: ["2024-01-01", "2024-01-01"] as [string, string],
        days_with_data: 1,
        unique_places: 1,
      },
      sources: [{ id: "s1", label: `<script>alert(1)</script>`, visitCount: 1, activityCount: 0 }],
      settings: { distanceUnit: "mi" },
      labels: [],
    });
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
  });
});
