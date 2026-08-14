import { describe, expect, it } from "vitest";
import { normalizeTimelineInput, parseTimelineJson } from "./timeline-import.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "timeline-import", "fixtures");

function load(name: string) {
  return JSON.parse(readFileSync(path.join(fixtures, name), "utf8")) as unknown;
}

describe("normalizeTimelineInput", () => {
  it("parses classic visit/activity array", () => {
    const records = normalizeTimelineInput(load("classic-array.json"));
    expect(records.length).toBeGreaterThan(0);
    expect(records[0].visit || records[0].activity).toBeTruthy();
  });

  it("parses semanticSegments Timeline.json", () => {
    const records = normalizeTimelineInput(load("semantic-segments.json"));
    expect(records.length).toBeGreaterThan(0);
  });

  it("parses Records.json locations", () => {
    const records = normalizeTimelineInput(load("records.json"));
    expect(records.length).toBe(1);
  });

  it("rejects Settings.json", () => {
    expect(() => normalizeTimelineInput({ timelineEnabled: true })).toThrow(/Settings/);
  });
});

describe("parseTimelineJson", () => {
  it("emits visits from classic array", () => {
    const parsed = parseTimelineJson(load("classic-array.json"));
    expect(parsed.visits.length + parsed.activities.length).toBeGreaterThan(0);
  });
});
