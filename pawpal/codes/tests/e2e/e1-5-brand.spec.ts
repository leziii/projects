import { expect, test, type Page } from '@playwright/test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { BRAND } from '../../shared/src/brand';
import { ADMIN, MOBILE, adminSession } from './helpers';

// E1-5: one brand everywhere (Trusted Teal) and an installable mobile app.
const root = join(__dirname, '..', '..');

/** "#147A69" → "rgb(20, 122, 105)", as the browser reports colours. */
const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
const pngSize = (buf: Buffer) => [buf.readUInt32BE(16), buf.readUInt32BE(20)];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'static' ? [] : sourceFiles(path);
    return /\.(vue|ts|css|scss)$/.test(name) && !name.endsWith('.test.ts') && !name.endsWith('.d.ts') ? [path] : [];
  });
}

test('no colour is hard-coded outside the brand file', () => {
  const offenders = [join(root, 'admin-web', 'src'), join(root, 'mobile', 'src')]
    .flatMap(sourceFiles)
    .filter((file) => /#[0-9a-f]{6}\b|#[0-9a-f]{3}\b|rgba?\(/i.test(readFileSync(file, 'utf8')))
    .map((file) => file.slice(root.length + 1));
  expect(offenders).toEqual([]);

  const brandColors = Object.values(BRAND.colors);
  const pages = readFileSync(join(root, 'mobile', 'src', 'pages.json'), 'utf8');
  for (const color of pages.match(/#[0-9a-f]{6}/gi) ?? []) expect(brandColors).toContain(color.toUpperCase());
});

test.describe('mobile app', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test('uses the brand colours, font and logo', async ({ page }) => {
    await page.goto(MOBILE);
    await expect(page.locator('[data-test=brand]')).toContainText('PawPal');
    await expect(page.locator('[data-test=brand]')).toContainText(BRAND.tagline);
    await expect(page.locator('[data-test=brand] img')).toBeVisible();
    const vars = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return { primary: s.getPropertyValue('--pp-primary').trim(), font: s.getPropertyValue('--pp-font').trim() };
    });
    expect(vars).toEqual({ primary: BRAND.colors.primary, font: BRAND.font });
    await expect(page.locator('body')).toHaveCSS('background-color', rgb(BRAND.colors.background));
    await expect(page.locator('[data-test=prices] .price').first()).toHaveCSS('color', rgb(BRAND.colors.primaryStrong));
  });

  test('has what phones need to install it', async ({ page, request }) => {
    await page.goto(MOBILE);
    await expect(page).toHaveTitle('PawPal');
    await expect(page.locator('meta[name=theme-color]')).toHaveAttribute('content', BRAND.colors.primary);
    await expect(page.locator('meta[name=apple-mobile-web-app-capable]')).toHaveAttribute('content', 'yes');
    await expect(page.locator('link[rel=manifest]')).toHaveAttribute('href', '/manifest.webmanifest');
    await expect(page.locator('link[rel=apple-touch-icon]')).toHaveAttribute('href', '/static/icons/apple-touch-icon.png');

    const manifest = await (await request.get(`${MOBILE}/manifest.webmanifest`)).json();
    expect(manifest).toMatchObject({ name: 'PawPal', display: 'standalone', start_url: '/', theme_color: BRAND.colors.primary });
    for (const icon of [...manifest.icons, { src: '/static/icons/apple-touch-icon.png', sizes: '180x180' }]) {
      const res = await request.get(`${MOBILE}${icon.src}`);
      expect(res.ok(), icon.src).toBe(true);
      expect(pngSize(await res.body()).join('x')).toBe(icon.sizes);
    }
    const sw = await request.get(`${MOBILE}/sw.js`);
    expect(sw.ok()).toBe(true);
    expect(await sw.text()).toContain("addEventListener('fetch'");
  });

  test('Android: our Install button appears when the browser allows it', async ({ page }) => {
    await page.goto(MOBILE);
    await expect(page.locator('[data-test=install]')).toHaveCount(0);
    await page.evaluate(() => {
      const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: () => Promise<void> };
      e.prompt = () => Promise.resolve();
      window.dispatchEvent(e);
    });
    const banner = page.locator('[data-test=install]');
    await expect(banner).toContainText('Add PawPal to your home screen');
    await expect(banner.locator('[data-test=install-button]')).toHaveCSS('background-color', rgb(BRAND.colors.primaryStrong));
    await banner.locator('[data-test=install-button]').click();
    await expect(banner).toHaveCount(0);
  });
});

test('iPhone Safari: shows "Add to Home Screen" steps', async ({ browser }) => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  });
  const page: Page = await ctx.newPage();
  await page.goto(MOBILE);
  await expect(page.locator('[data-test=install]')).toContainText('Tap the Share button, then "Add to Home Screen".');
  await ctx.close();
});

test('admin console uses the brand', async ({ page, request }) => {
  await adminSession(page, request);
  await page.goto(`${ADMIN}/payments`);
  await expect(page.locator('[data-test=brand]')).toContainText('PawPal');
  await expect(page.locator('[data-test=brand] img')).toBeVisible();
  await expect(page.locator('meta[name=theme-color]')).toHaveAttribute('content', BRAND.colors.primary);
  await expect(page.locator('[data-test=new-charge]')).toHaveCSS('background-color', rgb(BRAND.colors.primaryStrong));
  await expect(page.locator('body')).toHaveCSS('font-family', /Poppins/);
});
