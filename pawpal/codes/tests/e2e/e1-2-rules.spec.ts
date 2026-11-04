import { expect, test } from '@playwright/test';
import { adminSession } from './helpers';

// E1-2: prices and limits come from the shared rules.
test('mobile home shows the price list', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('http://localhost:5174/');
  const prices = page.locator('[data-test=prices]');
  await expect(prices).toContainText('Cat');
  await expect(prices).toContainText('RM40');
  await expect(prices).toContainText('Dog upgrade');
  await expect(prices).toContainText('RM70');
  await expect(prices).toContainText('Dog price + RM10 per cat');
  await expect(prices).toContainText('RM10 per 15 min');
  await expect(page.getByText('Max 3 pets, max 2 dogs per booking.')).toBeVisible();
});

test('admin rules page shows prices and limits from the server', async ({ page, request }) => {
  await adminSession(page, request);
  await page.goto('http://localhost:5173/');
  await page.getByRole('menuitem', { name: 'Rules' }).click();
  await expect(page).toHaveURL(/\/rules$/);
  await expect(page.locator('[data-test=prices]')).toContainText('RM60');
  const limits = page.locator('[data-test=limits]');
  await expect(limits).toContainText('≥24 h: 100% · 1–24 h: 80% · <1 h: 0%');
  await expect(limits).toContainText('Caregiver 85%, platform 15%');
  await expect(limits).toContainText('max 20 days per order');
});
