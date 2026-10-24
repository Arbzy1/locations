import { describe, expect, it } from 'vitest';
import {
  filterAndRankPlaces,
  findPlaceLabel,
  placeLabelLookup,
  placeMatchesTypes,
  placeMetric,
  sourceTokenVar,
  toggleChip,
  uniqueTopTypes,
} from '@locations/web/lib/explorer/hotspots';

const home = {
  lat: 51.5,
  lon: -0.1,
  count: 10,
  totalDurationMinutes: 100,
  topTypes: ['Home'],
  cluster: 'Home',
  label: 'Home',
};
const cafe = {
  lat: 51.51,
  lon: -0.12,
  count: 40,
  totalDurationMinutes: 20,
  topTypes: ['Restaurant'],
  cluster: 'Cafe',
  label: 'Cafe',
};

describe('placeMatchesTypes', () => {
  it('matches case-insensitively and allows empty selection', () => {
    expect(placeMatchesTypes(['Home', 'Work'], [])).toBe(true);
    expect(placeMatchesTypes(['Home'], ['home'])).toBe(true);
    expect(placeMatchesTypes(['Work'], ['Home'])).toBe(false);
  });
});

describe('placeMetric', () => {
  it('uses visits or dwell minutes', () => {
    expect(placeMetric(home, 'visits')).toBe(10);
    expect(placeMetric(home, 'dwell')).toBe(100);
  });
});

describe('filterAndRankPlaces', () => {
  it('filters by type and ranks by dwell with favourites first', () => {
    const ranked = filterAndRankPlaces([home, cafe], {
      types: [],
      tags: [],
      favouritesOnly: false,
      rankBy: 'dwell',
      labels: [{ placeKey: 'Cafe', label: 'Cafe', hidden: false, favourite: true, tags: [] }],
    });
    expect(ranked.map((p) => p.cluster)).toEqual(['Cafe', 'Home']);
  });

  it('keeps only selected types', () => {
    const ranked = filterAndRankPlaces([home, cafe], {
      types: ['Restaurant'],
      tags: [],
      favouritesOnly: false,
      rankBy: 'visits',
      labels: [],
    });
    expect(ranked.map((p) => p.cluster)).toEqual(['Cafe']);
  });
});

describe('uniqueTopTypes', () => {
  it('skips Unknown and caps the list', () => {
    expect(uniqueTopTypes([{ ...home, topTypes: ['Unknown', 'Home'] }, cafe])).toEqual([
      'Home',
      'Restaurant',
    ]);
  });
});

describe('toggleChip', () => {
  it('adds and removes', () => {
    expect(toggleChip(['Home'], 'Work')).toEqual(['Home', 'Work']);
    expect(toggleChip(['Home', 'Work'], 'Home')).toEqual(['Work']);
  });
});

describe('sourceTokenVar', () => {
  it('maps allowlisted tokens to CSS variables', () => {
    expect(sourceTokenVar('visit')).toBe('var(--visit)');
    expect(sourceTokenVar(null)).toBe('var(--accent)');
    expect(sourceTokenVar('#ff00aa')).toBe('var(--accent)');
  });
});

describe('placeLabelLookup', () => {
  it('matches findPlaceLabel, including which label wins when several match', () => {
    const labels = [
      { placeKey: '51.50000,-0.10000', label: 'By coords', hidden: false },
      { placeKey: 'Home', label: 'By cluster', hidden: false },
      { placeKey: 'Elsewhere', label: 'Other', hidden: false },
      { placeKey: 'Home', label: 'Duplicate', hidden: false },
    ];
    const lookup = placeLabelLookup(labels);
    const points = [
      home,
      cafe,
      { lat: 1, lon: 2, count: 1, cluster: 'Elsewhere' },
      { lat: 3, lon: 4, count: 1 },
    ];
    for (const p of points) expect(lookup(p)).toBe(findPlaceLabel(p, labels));
    expect(lookup(home)?.label).toBe('By coords');
  });
});
