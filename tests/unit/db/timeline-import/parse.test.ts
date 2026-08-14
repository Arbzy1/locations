import { describe, expect, it } from "vitest";
import { normalizeTimelineInput, parseTimelineJson } from "@locations/db";
import { loadTimelineFixture } from "@tests/helpers/fixtures";

describe("normalizeTimelineInput", () => {
  it("parses classic visit/activity array", () => {
    const records = normalizeTimelineInput(loadTimelineFixture("classic-array.json"));
    expect(records.length).toBeGreaterThan(0);
    expect(records[0].visit || records[0].activity).toBeTruthy();
  });

  it("parses semanticSegments Timeline.json", () => {
    const records = normalizeTimelineInput(loadTimelineFixture("semantic-segments.json"));
    expect(records.length).toBeGreaterThan(0);
  });

  it("parses Records.json locations", () => {
    const records = normalizeTimelineInput(loadTimelineFixture("timeline-records.json"));
    expect(records.length).toBe(1);
  });

  it("rejects Settings.json", () => {
    expect(() => normalizeTimelineInput({ timelineEnabled: true })).toThrow(/Settings/);
  });
});

describe("parseTimelineJson", () => {
  it("emits visits from classic array", () => {
    const parsed = parseTimelineJson(loadTimelineFixture("classic-array.json"));
    expect(parsed.visits.length + parsed.activities.length).toBeGreaterThan(0);
  });
});
