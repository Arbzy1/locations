import { describe, expect, it } from 'vitest';
import type { Activity, Connector, Visit } from '@locations/web/types';
import {
  buildPlaybackSegments,
  continuesPastDate,
  dayUtcBounds,
  interpolateAlong,
  playbackRange,
  positionAt,
  segmentAt,
  startedBeforeDate,
} from '@locations/web/lib/dayPlayback';

const visit = (over: Partial<Visit> = {}): Visit => ({
  start: '2024-06-15T10:00:00.000Z',
  end: '2024-06-15T12:00:00.000Z',
  lat: 51.5,
  lon: -0.1,
  cluster: 'Home',
  semantic_type: 'Home',
  duration_minutes: 120,
  ...over,
});

const activity = (over: Partial<Activity> = {}): Activity => ({
  start: '2024-06-15T12:00:00.000Z',
  end: '2024-06-15T13:00:00.000Z',
  start_lat: 51.5,
  start_lon: -0.1,
  end_lat: 51.6,
  end_lon: -0.2,
  mode: 'walking',
  distance_meters: 1000,
  duration_minutes: 60,
  ...over,
});

describe('dayUtcBounds', () => {
  it('uses exclusive next-midnight UTC', () => {
    const { startMs, endMs } = dayUtcBounds('2024-06-15');
    expect(startMs).toBe(Date.parse('2024-06-15T00:00:00.000Z'));
    expect(endMs).toBe(Date.parse('2024-06-16T00:00:00.000Z'));
  });
});

describe('overnight helpers', () => {
  it('detects start before and end after the selected date', () => {
    expect(startedBeforeDate('2024-06-14T22:00:00.000Z', '2024-06-15')).toBe(true);
    expect(startedBeforeDate('2024-06-15T01:00:00.000Z', '2024-06-15')).toBe(false);
    expect(continuesPastDate('2024-06-16T08:00:00.000Z', '2024-06-15')).toBe(true);
    expect(continuesPastDate('2024-06-15T23:00:00.000Z', '2024-06-15')).toBe(false);
  });
});

describe('interpolateAlong', () => {
  it('returns endpoints at 0 and 1', () => {
    const path: [number, number][] = [
      [0, 0],
      [0, 2],
    ];
    expect(interpolateAlong(path, 0)).toEqual({ lat: 0, lon: 0 });
    expect(interpolateAlong(path, 1)).toEqual({ lat: 0, lon: 2 });
  });

  it('splits a two-point line in half', () => {
    const mid = interpolateAlong(
      [
        [0, 0],
        [0, 2],
      ],
      0.5,
    );
    expect(mid.lat).toBeCloseTo(0, 5);
    expect(mid.lon).toBeCloseTo(1, 5);
  });
});

describe('buildPlaybackSegments', () => {
  it('keeps a same-day stay as a visit segment', () => {
    const segs = buildPlaybackSegments('2024-06-15', [visit()], [], []);
    expect(segs).toHaveLength(1);
    expect(segs[0].kind).toBe('visit');
    expect(segs[0].startMs).toBe(Date.parse('2024-06-15T10:00:00.000Z'));
    expect(segs[0].endMs).toBe(Date.parse('2024-06-15T12:00:00.000Z'));
  });

  it('clips an overnight stay to the selected UTC day', () => {
    const overnight = visit({
      start: '2024-06-15T22:00:00.000Z',
      end: '2024-06-16T08:00:00.000Z',
      duration_minutes: 600,
    });
    const day1 = buildPlaybackSegments('2024-06-15', [overnight], [], []);
    expect(day1).toHaveLength(1);
    expect(day1[0].startMs).toBe(Date.parse('2024-06-15T22:00:00.000Z'));
    expect(day1[0].endMs).toBe(Date.parse('2024-06-16T00:00:00.000Z'));

    const day2 = buildPlaybackSegments('2024-06-16', [overnight], [], []);
    expect(day2).toHaveLength(1);
    expect(day2[0].startMs).toBe(Date.parse('2024-06-16T00:00:00.000Z'));
    expect(day2[0].endMs).toBe(Date.parse('2024-06-16T08:00:00.000Z'));
  });

  it('drops visits that do not overlap the day', () => {
    const segs = buildPlaybackSegments(
      '2024-06-15',
      [visit({ start: '2024-06-14T10:00:00.000Z', end: '2024-06-14T12:00:00.000Z' })],
      [],
      [],
    );
    expect(segs).toHaveLength(0);
  });
});

describe('positionAt', () => {
  it('holds a visit point for the whole stay', () => {
    const segs = buildPlaybackSegments('2024-06-15', [visit()], [], []);
    const mid = positionAt(segs, Date.parse('2024-06-15T11:00:00.000Z'));
    expect(mid?.lat).toBe(51.5);
    expect(mid?.lon).toBe(-0.1);
    expect(mid?.segment?.kind).toBe('visit');
  });

  it('interpolates a straight-line journey', () => {
    const segs = buildPlaybackSegments('2024-06-15', [], [activity()], []);
    const mid = positionAt(segs, Date.parse('2024-06-15T12:30:00.000Z'));
    expect(mid?.segment?.kind).toBe('activity');
    expect(mid?.lat).toBeCloseTo(51.55, 4);
    expect(mid?.lon).toBeCloseTo(-0.15, 4);
  });

  it('paces along step durations when present', () => {
    const stepped = activity({
      start: '2024-06-15T12:00:00.000Z',
      end: '2024-06-15T12:00:10.000Z',
      route_geometry: [
        [0, 0],
        [0, 1],
        [0, 2],
      ],
      steps: [
        {
          name: 'slow',
          distance_meters: 100,
          duration_seconds: 9,
          direction: 'straight',
          geometry: [
            [0, 0],
            [0, 1],
          ],
        },
        {
          name: 'fast',
          distance_meters: 100,
          duration_seconds: 1,
          direction: 'straight',
          geometry: [
            [0, 1],
            [0, 2],
          ],
        },
      ],
    });
    const segs = buildPlaybackSegments('2024-06-15', [], [stepped], []);
    const mid = positionAt(segs, Date.parse('2024-06-15T12:00:05.000Z'));
    expect(mid?.lon).toBeGreaterThan(0);
    expect(mid?.lon).toBeLessThan(1);
  });

  it('interpolates unknown connectors', () => {
    const connector: Connector = {
      from_time: '2024-06-15T13:00:00.000Z',
      to_time: '2024-06-15T13:10:00.000Z',
      from_lat: 10,
      from_lon: 10,
      to_lat: 10,
      to_lon: 20,
      route_geometry: [
        [10, 10],
        [10, 20],
      ],
      steps: [],
      distance_meters: 1000,
    };
    const segs = buildPlaybackSegments('2024-06-15', [], [], [connector]);
    const mid = positionAt(segs, Date.parse('2024-06-15T13:05:00.000Z'));
    expect(mid?.segment?.kind).toBe('unknown');
    expect(mid?.lat).toBeCloseTo(10, 5);
    expect(mid?.lon).toBeCloseTo(15, 4);
  });

  it('holds the last point in a gap with no connector', () => {
    const segs = buildPlaybackSegments(
      '2024-06-15',
      [
        visit({
          start: '2024-06-15T10:00:00.000Z',
          end: '2024-06-15T11:00:00.000Z',
          lat: 1,
          lon: 1,
        }),
        visit({
          start: '2024-06-15T14:00:00.000Z',
          end: '2024-06-15T15:00:00.000Z',
          lat: 9,
          lon: 9,
        }),
      ],
      [],
      [],
    );
    const gap = positionAt(segs, Date.parse('2024-06-15T12:00:00.000Z'));
    expect(gap?.lat).toBe(1);
    expect(gap?.lon).toBe(1);
    expect(segmentAt(segs, Date.parse('2024-06-15T12:00:00.000Z'))).toBeNull();
  });
});

describe('playbackRange', () => {
  it('spans first start to last end', () => {
    const segs = buildPlaybackSegments(
      '2024-06-15',
      [visit()],
      [activity({ start: '2024-06-15T12:00:00.000Z', end: '2024-06-15T13:30:00.000Z' })],
      [],
    );
    const range = playbackRange(segs);
    expect(range?.startMs).toBe(Date.parse('2024-06-15T10:00:00.000Z'));
    expect(range?.endMs).toBe(Date.parse('2024-06-15T13:30:00.000Z'));
  });
});
