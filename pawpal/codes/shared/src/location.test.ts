import { describe, expect, it } from 'vitest';
import { checkAddress } from './addresses';
import { checkLocation, distanceM, distanceText, geoPointOf } from './location';

const home = { lat: 3.1319, lng: 101.6841 }; // Cheras area

describe('E8-6 location check', () => {
  it('measures distance and flags over 500 m (R7-2, R38-4)', () => {
    expect(distanceM(home, home)).toBe(0);
    const near = { lat: 3.1349, lng: 101.6841 }; // ~334 m north
    const far = { lat: 3.1419, lng: 101.6841 }; // ~1.1 km north
    expect(distanceM(home, near)).toBeGreaterThan(300);
    expect(checkLocation(home, near)).toEqual({ distanceM: distanceM(home, near), flag: null });
    expect(checkLocation(home, far).flag).toBe('far');
    expect(checkLocation(home, null)).toEqual({ distanceM: null, flag: 'not_shared' });
    expect(checkLocation(null, near)).toEqual({ distanceM: null, flag: 'no_home' });
    expect(distanceText(1112)).toBe('1.1 km');
    expect(distanceText(334)).toBe('334 m');
  });

  it('accepts only real coordinates, rounded to 6 places', () => {
    expect(geoPointOf({ lat: 3.13190049, lng: 101.684 })).toEqual({ lat: 3.1319, lng: 101.684 });
    expect(geoPointOf({ lat: 91, lng: 0 })).toBeNull();
    expect(geoPointOf({ lat: '3', lng: 101 })).toBeNull();
    expect(geoPointOf(null)).toBeNull();
  });

  it('the address keeps the home position the owner set (R38-2)', () => {
    const base = { area: 'Cheras', street: '12 Jalan Genting', unit: 'A-3-1', postcode: '56000', contactName: 'Ali', contactPhone: '0123456789' };
    expect(checkAddress({ ...base, home }).home).toEqual(home);
    expect(checkAddress(base).home).toBeNull();
  });
});
