import { BRAND } from '@pawpal/shared';
import { describe, expect, it } from 'vitest';
import { applyBrand } from './brand';

describe('mobile brand', () => {
  it('sets the brand CSS variables on the page', () => {
    const set: Record<string, string> = {};
    applyBrand({ style: { setProperty: (n, v) => (set[n] = v) } });
    expect(set['--pp-primary']).toBe(BRAND.colors.primary);
    expect(set['--pp-font']).toBe(BRAND.font);
  });

  it('does nothing without a page', () => {
    expect(() => applyBrand(undefined)).not.toThrow();
  });
});
