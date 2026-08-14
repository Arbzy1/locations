import { describe, expect, it } from 'vitest';
import { pickLatestYearReview, currentMonthYm } from '@locations/web/lib/year-review';
import { visiblePersonality } from '@locations/web/lib/personality';
import { walkProgress } from '@locations/web/lib/walk-goal';
import { insightsCsv } from '@locations/web/lib/insights-export';

describe('pickLatestYearReview', () => {
  it('reads a map of years and a single chapter', () => {
    expect(pickLatestYearReview({ year: 2024, distance_miles: 1, visits: 1, activities: 1, days_tracked: 1, top_places: [], modes: {} })?.year).toBe(2024);
    expect(
      pickLatestYearReview({
        '2023': { year: 2023, distance_miles: 1, visits: 1, activities: 1, days_tracked: 1, top_places: [], modes: {} },
        '2024': { year: 2024, distance_miles: 2, visits: 1, activities: 1, days_tracked: 1, top_places: [], modes: {} },
      })?.year,
    ).toBe(2024);
    expect(pickLatestYearReview([])).toBeNull();
  });
});

describe('visiblePersonality', () => {
  it('hides dismissed ids', () => {
    expect(visiblePersonality([{ id: 'walker' }, { id: 'flyer' }], ['walker']).map((t) => t.id)).toEqual(['flyer']);
  });
});

describe('walkProgress', () => {
  it('caps at 1', () => {
    expect(walkProgress(10, 20)).toBe(0.5);
    expect(walkProgress(40, 20)).toBe(1);
    expect(walkProgress(5, 0)).toBe(0);
  });
});

describe('currentMonthYm', () => {
  it('formats UTC when timezone is unset', () => {
    expect(currentMonthYm(null, new Date('2026-08-14T12:00:00Z'))).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe('insightsCsv', () => {
  it('includes yearly rows', () => {
    const csv = insightsCsv(
      [{ year: 2024, distance_miles: 10, visits: 2, activities: 1, days_tracked: 3, modes: {} }],
      [{ month: '2024-06', distance_miles: 4, visits: 1, activities: 1, top_places: [], modes: {} }],
      [{ label: 'Total Distance', value: '10', description: '' }],
      { current: 2, longest: 4, longestGap: 1, lastDate: '2024-06-02' },
      {},
      'mi',
    );
    expect(csv).toContain('yearly');
    expect(csv).toContain('streaks');
  });
});
