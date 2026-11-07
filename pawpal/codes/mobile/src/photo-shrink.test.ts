import { describe, expect, it } from 'vitest';
import { fitSize } from './photo-shrink';

describe('photo shrink (R36-4)', () => {
  it('fits the longest side into 1600 px and never enlarges', () => {
    expect(fitSize(4000, 3000)).toEqual({ w: 1600, h: 1200 });
    expect(fitSize(3000, 4000)).toEqual({ w: 1200, h: 1600 });
    expect(fitSize(800, 600)).toEqual({ w: 800, h: 600 });
  });
});
