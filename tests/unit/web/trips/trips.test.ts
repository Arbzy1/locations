import { describe, expect, it } from 'vitest';
import { formatFunFact, isGridCluster, multiDayTripLabel } from '@locations/web/lib/trips';

describe('multiDayTripLabel', () => {
  it('hides grid cells and hidden places', () => {
    expect(
      multiDayTripLabel(
        { clusters: ['London', '51.5°N 0.0°W', 'Paris'] },
        new Set(),
      ),
    ).toBe('London to Paris');
    expect(
      multiDayTripLabel({ clusters: ['London', 'Paris'] }, new Set(['London', 'Paris'])),
    ).toBeNull();
    expect(isGridCluster('51.5°N 0.0°W')).toBe(true);
  });
});

describe('formatFunFact', () => {
  it('formats miles for longest day and farthest from home', () => {
    expect(
      formatFunFact(
        { label: 'Longest Day', value: '2024-06-01', description: '', miles: 42, date: '2024-06-01' },
        'mi',
      ),
    ).toEqual({ value: '42 mi', description: '2024-06-01' });
    expect(
      formatFunFact(
        {
          label: 'Farthest from Home',
          value: 'Paris',
          description: 'from guessed home',
          miles: 210,
        },
        'mi',
      ).value,
    ).toBe('Paris');
  });
});
