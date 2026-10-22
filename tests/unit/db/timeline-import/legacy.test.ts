import { describe, expect, it } from "vitest";
import { countTimelineRecords, detectTimelineFormat, parseTimelineJson } from "@locations/db";

const legacy = {
  timelineObjects: [
    {
      placeVisit: {
        location: { latitudeE7: 515000000, longitudeE7: -1000000, placeId: "ChIJhome", semanticType: "TYPE_HOME" },
        duration: { startTimestampMs: String(Date.UTC(2019, 0, 5, 8)), endTimestampMs: String(Date.UTC(2019, 0, 5, 12)) },
        childVisits: [
          {
            location: { latitudeE7: 515001000, longitudeE7: -1000000 },
            duration: { startTimestamp: "2019-01-05T09:00:00Z", endTimestamp: "2019-01-05T10:00:00Z" },
          },
        ],
      },
    },
    {
      activitySegment: {
        startLocation: { latitudeE7: 515000000, longitudeE7: -1000000 },
        endLocation: { latitudeE7: 515500000, longitudeE7: -1000000 },
        duration: { startTimestamp: "2019-01-05T12:00:00Z", endTimestamp: "2019-01-05T12:30:00Z" },
        distance: 5600,
        activityType: "IN_PASSENGER_VEHICLE",
        simplifiedRawPath: {
          points: [
            { latE7: 515200000, lngE7: -1000000, timestamp: "2019-01-05T12:10:00Z" },
            { latE7: 515400000, lngE7: -1000000, timestamp: "2019-01-05T12:20:00Z" },
          ],
        },
      },
    },
  ],
};

describe("legacy Semantic Location History", () => {
  it("is detected and counted", () => {
    expect(detectTimelineFormat(legacy)).toBe("legacy");
    expect(countTimelineRecords(legacy)).toBe(2);
  });

  it("imports stays, nested stays, journeys and their GPS path", () => {
    const { visits, activities } = parseTimelineJson(legacy);
    // Parent 08:00-12:00 split around the 09:00-10:00 child: three pieces, four hours.
    expect(visits).toHaveLength(3);
    expect(visits.reduce((s, v) => s + v.durationMinutes, 0)).toBe(240);
    expect(visits[0].semanticType).toBe("Home");
    expect(visits[0].placeId).toBe("ChIJhome");
    expect(activities).toHaveLength(1);
    expect(activities[0].mode).toBe("car");
    expect(activities[0].distanceMeters).toBe(5600);
    expect(activities[0].path).toHaveLength(2);
  });
});
