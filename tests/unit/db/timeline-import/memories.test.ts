import { describe, expect, it } from "vitest";
import { buildStore, inferHomeWork, namedTripsFromMemories, parseTimelineJson } from "@locations/db";

const memory = {
  startTime: "2022-04-13T06:56:34.095Z",
  endTime: "2022-04-15T18:06:38.214Z",
  timelineMemory: { destinations: [{ identifier: "ChIJabc" }], distanceFromOriginKms: "202" },
};
const stay = {
  startTime: "2022-04-13T09:00:00Z",
  endTime: "2022-04-13T10:00:00Z",
  visit: { topCandidate: { placeLocation: "geo:51.5,-0.1", semanticType: "Unknown" } },
};

describe("Timeline memories", () => {
  it("are parsed alongside stays", () => {
    const parsed = parseTimelineJson([memory, stay]);
    expect(parsed.memories).toEqual([
      { start: memory.startTime, end: memory.endTime, destinations: ["ChIJabc"], distanceKm: 202 },
    ]);
  });

  it("become named trips with stable ids and every date", () => {
    const [trip] = namedTripsFromMemories(parseTimelineJson([memory, stay]).memories ?? [], "src-1");
    expect(trip).toEqual({
      id: "google-src-1-2022-04-13-2022-04-15",
      name: "Trip, Apr 2022 (202 km from home)",
      start: "2022-04-13",
      end: "2022-04-15",
      dates: ["2022-04-13", "2022-04-14", "2022-04-15"],
    });
  });
});

describe("Google's home and work labels", () => {
  it("win over the hour-of-day guess", () => {
    const visit = (cluster: string, start: string, semanticType: string) => ({
      id: 1,
      tenant: "t",
      sourceId: "s",
      start,
      end: start,
      date: start.slice(0, 10),
      lat: 51.5,
      lon: -0.1,
      cluster,
      semanticType,
      placeId: null,
      durationMinutes: 60,
      fixLat: null,
      fixLon: null,
      fixCount: null,
      placeKey: null,
    });
    const store = buildStore(
      [
        visit("night-spot", "2024-01-01T23:00:00Z", "Unknown"),
        visit("night-spot", "2024-01-02T23:00:00Z", "Unknown"),
        visit("real-home", "2024-01-03T12:00:00Z", "Home"),
      ],
      [],
      [],
    );
    expect(inferHomeWork(store).home?.cluster).toBe("real-home");
  });
});
