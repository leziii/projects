import { describe, expect, it } from 'vitest';
import { ICONS } from './icons';

describe('icons', () => {
  it('every icon is one or more SVG path strings', () => {
    for (const [name, paths] of Object.entries(ICONS)) {
      expect(paths.length, name).toBeGreaterThan(0);
      for (const d of paths) expect(d, name).toMatch(/^[Mm][\d.\s,a-zA-Z-]+$/);
    }
  });
});
