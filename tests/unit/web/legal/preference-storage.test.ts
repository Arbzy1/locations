import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { preferenceStorage, setStorageChoice } from '@locations/web/lib/preference-storage';

let store: Record<string, string>;
beforeEach(() => {
  store = {};
  const api = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
  };
  vi.stubGlobal('localStorage', new Proxy(api, {
    ownKeys: () => Object.keys(store),
    getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
  }));
});
afterEach(() => vi.unstubAllGlobals());
describe('optional browser storage', () => {
  it('does not read legacy persisted location preferences before opt-in', () => {
    store['locations-recent-places'] = 'private legacy places';
    expect(preferenceStorage.getItem('locations-recent-places')).toBeNull();
  });
  it('keeps new preferences functional in memory without persisting them', () => {
    preferenceStorage.setItem('locations-theme', 'light');
    expect(preferenceStorage.getItem('locations-theme')).toBe('light');
    expect(store['locations-theme']).toBeUndefined();
  });
  it('allows persistence and removes saved locations when consent is withdrawn', () => {
    setStorageChoice(true);
    preferenceStorage.setItem('locations-journey-cost:last-estimate', 'private trip');
    expect(store['locations-journey-cost:last-estimate']).toBe('private trip');
    store['unrelated-key'] = 'keep';
    setStorageChoice(false);
    expect(store['locations-journey-cost:last-estimate']).toBeUndefined();
    expect(store['locations-storage-consent']).toBe('deny');
    expect(store['unrelated-key']).toBe('keep');
    preferenceStorage.setItem('locations-walk-goal', '42');
    expect(store['locations-walk-goal']).toBeUndefined();
  });
  it('keeps controls usable when browser storage is unavailable', () => {
    vi.stubGlobal('localStorage', { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } });
    expect(() => preferenceStorage.setItem('blocked-choice', 'ok')).not.toThrow();
    expect(preferenceStorage.getItem('blocked-choice')).toBe('ok');
  });
});
