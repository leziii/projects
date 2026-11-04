// Draws the app icons from the brand logo (shared/src/brand.ts). Run: pnpm icons
// Needs the shared build and Playwright's Chromium (see README).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'tests', 'package.json'));
const { chromium } = require('playwright');
const { BRAND } = require(join(root, 'shared', 'dist', 'index.js'));

const logo = `data:image/svg+xml,${encodeURIComponent(BRAND.logoSvg)}`;
// "Full bleed": brand colour to the edges, logo inside the safe zone (Android maskable, iPhone).
const bleed = (size) =>
  `<div style="width:${size}px;height:${size}px;background:${BRAND.colors.primary};display:flex;align-items:center;justify-content:center">` +
  `<img src="${logo}" style="width:${Math.round(size * 0.72)}px;height:${Math.round(size * 0.72)}px"></div>`;
const plain = (size) => `<img src="${logo}" style="width:${size}px;height:${size}px;display:block">`;

const icons = [
  ['mobile/src/static/icons/icon-192.png', 192, plain],
  ['mobile/src/static/icons/icon-512.png', 512, plain],
  ['mobile/src/static/icons/maskable-512.png', 512, bleed],
  ['mobile/src/static/icons/apple-touch-icon.png', 180, bleed],
  ['mobile/src/static/icons/favicon-32.png', 32, plain],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [file, size, draw] of icons) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${draw(size)}</body></html>`);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  const out = join(root, file);
  mkdirSync(dirname(out), { recursive: true });
  await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log(`${file} (${size}×${size})`);
}
for (const file of ['mobile/src/static/icons/logo.svg', 'admin-web/public/logo.svg']) {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), BRAND.logoSvg);
}
await browser.close();
