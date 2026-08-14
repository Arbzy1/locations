import { describe, expect, it } from 'vitest';
import { sunTimes } from '@locations/web/utils/sunTimes';

function utcHour(d: Date): number {
  return d.getUTCHours() + d.getUTCMinutes() / 60;
}

describe('sunTimes', () => {
  it('returns sunrise before sunset for a mid-latitude summer day', () => {
    const { sunrise, sunset } = sunTimes(51.5, -0.12, '2024-06-21');
    expect(sunrise).toBeInstanceOf(Date);
    expect(sunset).toBeInstanceOf(Date);
    expect(sunrise!.getTime()).toBeLessThan(sunset!.getTime());
    expect(utcHour(sunrise!)).toBeGreaterThan(2);
    expect(utcHour(sunrise!)).toBeLessThan(6);
    expect(utcHour(sunset!)).toBeGreaterThan(18);
    expect(utcHour(sunset!)).toBeLessThan(22);
  });

  it('returns sunrise before sunset for a mid-latitude winter day', () => {
    const { sunrise, sunset } = sunTimes(40.7, -74.0, '2024-01-15');
    expect(sunrise).toBeInstanceOf(Date);
    expect(sunset).toBeInstanceOf(Date);
    expect(sunrise!.getTime()).toBeLessThan(sunset!.getTime());
    expect(utcHour(sunrise!)).toBeGreaterThan(11);
    expect(utcHour(sunrise!)).toBeLessThan(14);
    expect(utcHour(sunset!)).toBeGreaterThan(20);
    expect(utcHour(sunset!)).toBeLessThan(23);
  });

  it('omits rise and set in polar night', () => {
    const { sunrise, sunset } = sunTimes(78.2, 15.6, '2024-12-21');
    expect(sunrise).toBeNull();
    expect(sunset).toBeNull();
  });
});
