import { BRAND } from '@pawpal/shared';
import { describe, expect, it } from 'vitest';
import { applyBrand } from './brand';

describe('admin brand', () => {
  it('themes Element Plus and sets the brand variables', () => {
    const set: Record<string, string> = {};
    applyBrand({ style: { setProperty: (n, v) => (set[n] = v) } });
    expect(set['--el-color-primary']).toBe(BRAND.colors.primaryStrong);
    expect(set['--pp-background']).toBe(BRAND.colors.background);
    expect(set['--el-font-family']).toBe(BRAND.font);
  });
});
