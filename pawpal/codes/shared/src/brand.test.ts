import { describe, expect, it } from 'vitest';
import { BRAND, brandCssVars, contrastRatio, elementPlusVars, logoDataUrl, mixColor } from './brand';

describe('brand: Honey & Tan', () => {
  const c = BRAND.colors;

  it('is Honey & Tan chosen by KF (24 Nov 2026)', () => {
    expect(c.primary).toBe('#E8B65C');
    expect(BRAND.font).toMatch(/^'Plus Jakarta Sans'/);
  });

  it('every colour is #RRGGBB', () => {
    for (const v of Object.values(c)) expect(v).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('text is readable (WCAG AA, contrast ≥ 4.5)', () => {
    expect(contrastRatio(c.ink, c.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c.ink, c.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c.muted, c.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c.muted, c.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#FFFFFF', c.primaryStrong)).toBeGreaterThanOrEqual(4.5); // button text
    expect(contrastRatio(c.primaryStrong, c.background)).toBeGreaterThanOrEqual(4.5); // links
    expect(contrastRatio('#FFFFFF', c.danger)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#FFFFFF', c.success)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c.ink, c.accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c.ink, c.primary)).toBeGreaterThanOrEqual(4.5); // text on honey banners
    expect(contrastRatio(c.primaryStrong, c.primarySoft)).toBeGreaterThanOrEqual(4.5); // icons and selected items
    expect(contrastRatio('#FFFFFF', c.info)).toBeGreaterThanOrEqual(4.5);
  });

  it('measures contrast correctly', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBe(1);
  });

  it('mixes colours', () => {
    expect(mixColor('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(mixColor('#147A69', '#FFFFFF', 0)).toBe('#147A69');
    expect(mixColor('#147A69', '#FFFFFF', 1)).toBe('#FFFFFF');
    expect(() => mixColor('red', '#FFFFFF', 0.5)).toThrow('Not a #RRGGBB colour');
  });

  it('gives CSS variables for the apps', () => {
    const vars = brandCssVars();
    expect(vars['--pp-primary']).toBe('#E8B65C');
    expect(vars['--pp-primary-strong']).toBe('#8A5A22');
    expect(vars['--pp-background']).toBe('#F6F1E8');
    expect(vars['--pp-radius-button']).toBe('8px');
    expect(Object.keys(vars)).toHaveLength(Object.keys(c).length + 4);
  });

  it('themes Element Plus with readable buttons', () => {
    const vars = elementPlusVars();
    expect(vars['--el-color-primary']).toBe(c.primaryStrong);
    expect(vars['--el-color-primary-light-9']).toMatch(/^#[0-9A-F]{6}$/);
    expect(vars['--el-font-family']).toBe(BRAND.font);
  });

  it('logo is an SVG that uses the brand colour', () => {
    expect(BRAND.logoSvg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 64 64">/);
    expect(BRAND.logoSvg).toContain(c.primary);
    expect(logoDataUrl()).toMatch(/^data:image\/svg\+xml,%3Csvg/);
  });
});

describe('installable app (PWA)', () => {
  it('manifest has what Android and iPhone need to install', async () => {
    const { webManifest } = await import('./brand');
    const m = webManifest();
    expect(m).toMatchObject({ name: 'PawPal', start_url: '/', display: 'standalone', theme_color: '#E8B65C', background_color: '#F6F1E8' });
    expect(m.icons.map((i) => `${i.sizes} ${i.purpose}`)).toEqual(['192x192 any', '512x512 any', '512x512 maskable']);
  });

  it('head tags set the theme colour and load the font', async () => {
    const { headTags } = await import('./brand');
    const tags = headTags();
    expect(tags).toContain('<meta name="theme-color" content="#E8B65C">');
    expect(tags).toContain('apple-mobile-web-app-capable');
    expect(tags).toContain('family=Plus+Jakarta+Sans');
  });
});
