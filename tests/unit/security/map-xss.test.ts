import { describe, expect, it } from "vitest";
import {
  activityPopupHtml,
  connectorPopupHtml,
  visitPopupHtml,
} from "@locations/web/lib/map/mapPopups";
import type { Activity, Connector, Visit } from "@locations/web/types";

const xss = `<img onerror="alert(1)" src=x><script>alert(1)</script>`;

describe("map popup XSS escape", () => {
  it("escapes visit place names and addresses", () => {
    const visit: Visit = {
      start: "2024-01-01T10:00:00Z",
      end: "2024-01-01T11:00:00Z",
      lat: 51.5,
      lon: -0.1,
      cluster: xss,
      semantic_type: xss,
      place_name: xss,
      place_short_address: xss,
      duration_minutes: 12,
    };
    const html = visitPopupHtml(visit, 0, 1, "2024-01-01");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img onerror");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img");
  });

  it("escapes activity place labels", () => {
    const activity: Activity = {
      start: "2024-01-01T10:00:00Z",
      end: "2024-01-01T10:20:00Z",
      start_lat: 51.5,
      start_lon: -0.1,
      end_lat: 51.51,
      end_lon: -0.11,
      mode: "walking",
      distance_meters: 400,
      duration_minutes: 8,
      from_place: xss,
      to_place: xss,
    };
    const html = activityPopupHtml(activity, 0, 1, "var(--walk)", "mi");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes connector labels", () => {
    const connector: Connector = {
      from_time: "2024-01-01T10:00:00Z",
      to_time: "2024-01-01T10:05:00Z",
      from_lat: 51.5,
      from_lon: -0.1,
      to_lat: 51.51,
      to_lon: -0.11,
      route_geometry: [],
      steps: [],
      distance_meters: 80,
      is_routed: false,
      from_label: xss,
      to_label: xss,
    };
    const html = connectorPopupHtml(connector, "mi");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
