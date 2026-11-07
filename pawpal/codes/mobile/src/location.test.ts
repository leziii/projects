import { describe, expect, it } from 'vitest';
import { mapLink } from './location';

describe('E8-6 home position', () => {
  it('opens the saved point on Google Maps', () => {
    expect(mapLink({ lat: 3.1319, lng: 101.6841 })).toBe('https://www.google.com/maps?q=3.1319,101.6841');
  });
});
