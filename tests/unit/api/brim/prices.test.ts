import { describe, expect, it } from 'vitest';
import { resolveIcePrice } from '@locations/brim/shared';
import { fixtureCorpus, nearbyFromObservations } from "@locations/api/brim/prices";

describe('fixture prices', () => {
  it('falls back to 140 ppl with a loud warning when nothing is in the set', () => {
    const resolved = resolveIcePrice({ grade: 'E10', observations: [] });
    expect(resolved.source).toBe('hardcoded-fallback');
    expect(resolved.pence).toBe(140);
    expect(resolved.warning?.code).toBe('price-data-unavailable');
  });

  it('excludes stale and silent sites from nearby lists', () => {
    const corpus = fixtureCorpus('1');
    const near = nearbyFromObservations(corpus.observations, {
      lat: 51.1092,
      lng: -0.1872,
      radiusMeters: 20_000,
      grade: 'E10',
    });
    expect(near.some((s) => s.id === 'ff_shell_crawley')).toBe(true);
    expect(near.some((s) => s.id === 'ff_gulf_crawley_silent')).toBe(false);
    expect(near.some((s) => s.id === 'ff_shell_york_stale')).toBe(false);
  });
});
